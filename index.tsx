/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {GeneratedImage, GoogleGenAI} from '@google/genai';
import {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {
  AssetRecordType,
  Box,
  createShapeId,
  Editor,
  stopEventPropagation,
  Tldraw,
  TldrawProps,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  TLShapeId,
  TLTextShape,
  toRichText,
  track,
  useEditor,
  usePassThroughWheelEvents,
  useToasts,
} from 'tldraw';
import {GettingStarted} from './Components/GettingStarted';
import {NoticeBanner} from './Components/NoticeBanner';
import {PromptBar} from './Components/PromptBar';
import {
  addPlaceholder,
  bloblToBase64,
  createArrowBetweenShapes,
  loadIcon,
  placeNewShape,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './utils';

// Global state for studio settings
interface StudioSettings {
  systemPrompt: string;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  isProMode: boolean;
}

const MASTER_STYLE_PROMPT = `YOU ARE A SPECIALIST IMAGE GENERATOR FOR EDUCATIONAL RESOURCES.
ADHERE TO THIS MASTER VISUAL STYLE FOR ALL OUTPUTS:
- Style: Animated, cinematic 3D character illustration. Pixar-inspired but original (NOT Disney/Barbie).
- Detail: Stylised realism with natural facial asymmetry and unique proportions. NO IDENTICAL FACES.
- Anatomy: Soft, rounded anatomy. Expressive eyes with natural variation.
- Texture: Glossy, high-quality materials with subtle skin texture. NO plastic skin.
- Lighting: Warm, cinematic studio lighting with a storytelling focus.
- Camera: Shallow depth of field (bokeh).

MANDATORY NEGATIVE CONSTRAINTS - DO NOT PRODUCE:
- Barbie or doll-like faces, hyper-glam or beauty-filtered appearance.
- Perfect symmetry, plastic skin, or adult proportions on child characters.
- Babyish/chibi-style, anime, or low-detail rendering.

INTERPRET USER INPUTS AS TASK-SPECIFIC BRIEFS covering Characters (Age/Ethnicity/Body), Activity, Setting, Clothing, and Facial Expressions. Ensure inclusive, youthful, and age-appropriate content.`;

const DEFAULT_SETTINGS: StudioSettings = {
  systemPrompt: MASTER_STYLE_PROMPT,
  aspectRatio: "16:9",
  isProMode: false,
};

function getDimensionsFromRatio(ratio: string): { w: number, h: number } {
  switch (ratio) {
    case "1:1": return { w: 512, h: 512 };
    case "4:3": return { w: 640, h: 480 };
    case "3:4": return { w: 480, h: 640 };
    case "9:16": return { w: 360, h: 640 };
    case "16:9": 
    default:
      return { w: 640, h: 360 };
  }
}

async function getAiClient() {
  return new GoogleGenAI({apiKey: process.env.API_KEY});
}

async function describeImage(imageBlob: Blob): Promise<string> {
  const ai = await getAiClient();
  const imageDataBase64 = await bloblToBase64(imageBlob);
  const textPrompt = `Describe this image in technical photographic terms (lighting, lens, composition).`;

  const imagePrompt = {
    inlineData: {
      data: imageDataBase64,
      mimeType: 'image/jpeg',
    },
  };

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {parts: [{text: textPrompt}, imagePrompt]},
  });
  return result.text;
}

async function generateImages(
  prompt: string,
  settings: StudioSettings,
  imageBlob: Blob | null = null,
): Promise<string[]> {
  const ai = await getAiClient();
  const modelName = settings.isProMode ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const imageObjects: string[] = [];
  const parts: any[] = [{ text: prompt }];

  if (imageBlob) {
    const imageDataBase64 = await bloblToBase64(imageBlob);
    parts.unshift({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageDataBase64
      }
    });
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts },
    config: {
      systemInstruction: settings.systemPrompt,
      imageConfig: {
        aspectRatio: settings.aspectRatio,
        ...(settings.isProMode ? { imageSize: "1K" } : {})
      }
    },
  });

  const candidates = response.candidates?.[0]?.content?.parts || [];
  for (const part of candidates) {
    if (part.inlineData) {
      const src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      imageObjects.push(src);
    }
  }

  if (imageObjects.length === 0) {
    throw new Error("The AI did not return an image. Check your prompt and try again.");
  }

  return imageObjects;
}

const describeClick = async (editor: Editor) => {
  const shapes = editor.getSelectedShapes();
  shapes
    .filter((shape) => editor.isShapeOfType(shape, 'image'))
    .forEach(async (shape) => {
      const placeholderIds = addPlaceholder(editor, 'Analyzing Image...');
      editor.select(placeholderIds[0]);
      
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });

      try {
        const response = await describeImage(shapeExport.blob);
        editor.deleteShapes(placeholderIds);

        const textShapeId = createShapeId();
        editor.createShape({
          id: textShapeId,
          type: 'text',
          props: {
            richText: toRichText(response),
            autoSize: false,
            w: 400,
          },
        });

        const newShape = editor.getShape(textShapeId);
        if (newShape) {
          placeNewShape(editor, newShape);
          createArrowBetweenShapes(editor, shape.id, newShape.id);
        }
      } catch (e) {
        editor.deleteShapes(placeholderIds);
        console.error(e);
      }
    });
};

const genImageClick = async (editor: Editor, settings: StudioSettings) => {
  const shapes = editor.getSelectedShapes();
  const contents: string[] = [];
  const images: Blob[] = [];
  const sourceShapesId: TLShapeId[] = [];

  shapes.forEach((shape) => {
    if (editor.isShapeOfType(shape, 'text')) {
      const selectedTextShape = shape as TLTextShape;
      const text = (selectedTextShape.props.richText.content as any[])
        .filter((p) => p.type === 'paragraph')
        .map((p) => p.content.map((t: any) => t.text).join(''))
        .join('\n');
      if (text) contents.push(text);
      sourceShapesId.push(shape.id);
    }
  });

  const imageShapes = shapes.filter((shape) => editor.isShapeOfType(shape, 'image'));
  if (imageShapes.length > 0) {
    const shape = imageShapes[0];
    const shapeExport = await editor.toImage([shape.id], {
      format: 'png',
      scale: 1,
      background: true,
    });
    images.push(shapeExport.blob);
    sourceShapesId.push(shape.id);
  }

  if (contents.length === 0 && images.length === 0) return;

  const placeholderIds = addPlaceholder(editor, settings.isProMode ? 'Master Style Rendering (Pro)...' : 'Generating Resource...');
  editor.select(placeholderIds[0]);

  try {
    const promptText = contents.join('\n') || "Educational resource illustration";
    const imageObjects = await generateImages(promptText, settings, images[0] || null);
    
    editor.deleteShapes(placeholderIds);
    let lastId: TLShapeId | null = null;
    const { w, h } = getDimensionsFromRatio(settings.aspectRatio);

    imageObjects.forEach((imgSrc, i) => {
      const assetId = AssetRecordType.createId();
      editor.createAssets([{
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `educational_resource_${Date.now()}.jpg`,
          src: imgSrc,
          w: w,
          h: h,
          mimeType: 'image/jpeg',
          isAnimated: false,
        },
        meta: {},
      }]);

      lastId = createShapeId();
      editor.createShape({
        id: lastId,
        type: 'image',
        props: { 
          assetId, 
          w: w, 
          h: h 
        },
      });

      const newShape = editor.getShape(lastId);
      if (newShape) {
        placeNewShape(editor, newShape);
        sourceShapesId.forEach(sid => createArrowBetweenShapes(editor, sid, lastId!));
      }
    });

    if (lastId) {
      editor.select(lastId);
      editor.zoomToSelection({animation: {duration: 400}});
    }
  } catch (e: any) {
    editor.deleteShapes(placeholderIds);
    throw e;
  }
};

const assetUrls: TldrawProps['assetUrls'] = {
  icons: {
    'genai-describe-image': await loadIcon('/genai-describe-image.svg'),
    'genai-generate-image': await loadIcon('/genai-generate-image.svg'),
  },
};

const OverlayComponent = track(({ settings, onSettingsChange }: { settings: StudioSettings, onSettingsChange: (s: StudioSettings) => void }) => {
  const editor = useEditor();
  const {addToast} = useToasts();

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
      }}
      onPointerDown={stopEventPropagation}>
      <ContextualToolbarComponent settings={settings} />
      <PromptBar
        settings={settings}
        onSettingsChange={onSettingsChange}
        onSubmit={async (prompt, image) => {
          try {
            const idsToSelect: TLShapeId[] = [];
            if (image) {
              const assetId = AssetRecordType.createId();
              editor.createAssets([{
                id: assetId,
                type: 'image',
                typeName: 'asset',
                props: { 
                  src: image, 
                  w: VIDEO_WIDTH, 
                  h: VIDEO_HEIGHT, 
                  mimeType: 'image/jpeg', 
                  name: 'input.jpg',
                  isAnimated: false
                },
                meta: {},
              }]);
              const id = createShapeId();
              editor.createShape({ id, type: 'image', props: { assetId } });
              placeNewShape(editor, editor.getShape(id)!);
              idsToSelect.push(id);
            }
            if (prompt) {
              const id = createShapeId();
              editor.createShape({ id, type: 'text', props: { richText: toRichText(prompt) } });
              placeNewShape(editor, editor.getShape(id)!);
              idsToSelect.push(id);
            }
            if (idsToSelect.length > 0) {
              editor.select(...idsToSelect);
              await genImageClick(editor, settings);
            }
          } catch (e: any) {
            if (e.message?.includes("Requested entity was not found")) {
              addToast({ title: "Pro Mode error: Please re-select your API key.", severity: "warning" });
            } else {
              addToast({title: e.message, severity: 'error'});
            }
          }
        }}
      />
    </div>
  );
});

const ContextualToolbarComponent = track(({ settings }: { settings: StudioSettings }) => {
  const editor = useEditor();
  const showToolbar = editor.isIn('select.idle');
  const ref = useRef<HTMLDivElement>(null);
  usePassThroughWheelEvents(ref);

  if (!showToolbar) return <></>;

  const getSelectionBounds = () => {
    const fullBounds = editor.getSelectionRotatedScreenBounds();
    if (!fullBounds) return undefined;
    return new Box(fullBounds.x, fullBounds.y + fullBounds.height + 75, fullBounds.width, 0);
  };

  const shapes = editor.getSelectedShapes();
  const textShapes = shapes.filter(s => editor.isShapeOfType(s, 'text'));
  const imageShapes = shapes.filter(s => editor.isShapeOfType(s, 'image'));
  const otherShapes = shapes.filter(s => !editor.isShapeOfType(s, 'image') && !editor.isShapeOfType(s, 'text'));

  if (otherShapes.length > 0 || (textShapes.length === 0 && imageShapes.length === 0)) return null;

  const actions = [];
  if (imageShapes.length > 0 && textShapes.length === 0) {
    actions.push({ label: 'Analyze', title: 'Analyze image', icon: 'genai-describe-image', onClick: () => describeClick(editor) });
  }
  actions.push({ label: 'Studio Gen', title: 'Generate Master Style', icon: 'genai-generate-image', onClick: () => genImageClick(editor, settings) });

  return (
    <TldrawUiContextualToolbar getSelectionBounds={getSelectionBounds} label="Studio Tools">
      <div className="genai-actions-context" ref={ref}>
        {actions.map((a, i) => (
          <TldrawUiButton key={i} title={a.title} type="icon" onClick={a.onClick}>
            <TldrawUiButtonIcon small icon={a.icon} />
            {a.label}
          </TldrawUiButton>
        ))}
      </div>
    </TldrawUiContextualToolbar>
  );
});

export default function App() {
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [settings, setSettings] = useState<StudioSettings>(() => {
    const saved = localStorage.getItem('studio_settings_v2');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('studio_settings_v2', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisitedGenAICanvas');
    if (!hasVisited) setShowGettingStarted(true);
  }, []);

  return (
    <div className="app">
      {showGettingStarted && <GettingStarted onClose={() => {
        localStorage.setItem('hasVisitedGenAICanvas', 'true');
        setShowGettingStarted(false);
      }} />}
      <NoticeBanner />
      <Tldraw
        inferDarkMode
        components={{
          InFrontOfTheCanvas: () => <OverlayComponent settings={settings} onSettingsChange={setSettings} />,
        }}
        assetUrls={assetUrls}
        onMount={(editor) => {
          editor.user.updateUserPreferences({ animationSpeed: 1 });
        }}
      />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);