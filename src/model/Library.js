import { core, comms, image, ml } from './sources';

export default class Library {
  constructor() {
    this.nodeTypes = [];
    // Core
    this.nodeTypes.push({ name: 'Out', type: 'core.out', source: core.out });

    // Communication
    this.nodeTypes.push({ name: 'Send OSC', type: 'comms.sendOsc', source: comms.sendOsc });

    // this.nodeTypes.push({ name: 'Sequence', type: 'core.sequence', source: core.sequence });
    // this.nodeTypes.push({ name: 'Time', type: 'core.time', source: core.time });
    // this.nodeTypes.push({ name: 'Random Number', type: 'core.randomNumber', source: core.randomNumber });
    // this.nodeTypes.push({ name: 'Animate', type: 'core.animate', source: core.animate });
    // this.nodeTypes.push({ name: 'Smooth', type: 'core.smooth', source: core.smooth });
    // this.nodeTypes.push({ name: 'Mouse', type: 'core.mouse', source: core.mouse });
    // this.nodeTypes.push({
    //   name: 'Conditional Trigger',
    //   type: 'core.conditionalTrigger',
    //   source: core.conditionalTrigger,
    // });
    // this.nodeTypes.push({ name: 'Custom', type: 'core.custom', source: core.custom });

    // Math
    // this.nodeTypes.push({ name: 'Convert', type: 'math.convert', source: math.convert });

    // Graphics
    // this.nodeTypes.push({ name: 'Canvas', type: 'graphics.canvas', source: graphics.canvas });
    // this.nodeTypes.push({
    //   name: 'Draw Background',
    //   type: 'graphics.backgroundColor',
    //   source: graphics.backgroundColor,
    // });
    // this.nodeTypes.push({ name: 'Rectangle', type: 'graphics.rect', source: graphics.rect });
    // this.nodeTypes.push({ name: 'Line', type: 'graphics.line', source: graphics.line });
    // this.nodeTypes.push({ name: 'Transform', type: 'graphics.transform', source: graphics.transform });
    // this.nodeTypes.push({ name: 'Clone', type: 'graphics.clone', source: graphics.clone });
    // this.nodeTypes.push({ name: 'Draw Text', type: 'graphics.text', source: graphics.text });

    // Color
    // this.nodeTypes.push({ name: 'HSL Color', type: 'color.hsl', source: color.hsl });

    // Image

    // this.nodeTypes.push({ name: 'Draw Image', type: 'image.drawImage', source: image.drawImage });
    // this.nodeTypes.push({ name: 'Pixels', type: 'image.pixels', source: image.pixels });
    this.nodeTypes.push({ name: 'Barrel Distortion', type: 'image.barrelDistortion', source: image.barrelDistortion });
    this.nodeTypes.push({ name: 'Blur', type: 'image.blur', source: image.blur });
    this.nodeTypes.push({ name: 'Border', type: 'image.border', source: image.border });
    this.nodeTypes.push({ name: 'Brennan', type: 'image.brennan', source: image.brennan });
    this.nodeTypes.push({ name: 'Canny Edges', type: 'image.canny', source: image.canny });
    this.nodeTypes.push({ name: 'Cartoon', type: 'image.cartoon', source: image.cartoon });
    this.nodeTypes.push({ name: 'Composite', type: 'image.composite', source: image.composite });
    this.nodeTypes.push({ name: 'Constant', type: 'image.constant', source: image.constant });
    this.nodeTypes.push({ name: 'Crop', type: 'image.crop', source: image.crop });
    this.nodeTypes.push({ name: 'Distortion', type: 'image.distortion', source: image.distortion });
    this.nodeTypes.push({ name: 'Emboss', type: 'image.emboss', source: image.emboss });
    this.nodeTypes.push({ name: 'Graussian Blur', type: 'image.gaussianBlur', source: image.gaussianBlur });
    this.nodeTypes.push({ name: 'Grayscale', type: 'image.grayscale', source: image.grayscale });
    this.nodeTypes.push({ name: 'Invert', type: 'image.invert', source: image.invert });
    this.nodeTypes.push({ name: 'Lens Distortion', type: 'image.lensDistortion', source: image.lensDistortion });
    this.nodeTypes.push({ name: 'Levels', type: 'image.levels', source: image.levels });
    this.nodeTypes.push({ name: 'Load Image', type: 'image.loadImage', source: image.loadImage });
    this.nodeTypes.push({ name: 'Fetch Image', type: 'image.fetchImage', source: image.fetchImage });
    this.nodeTypes.push({ name: 'Load Image Folder', type: 'image.loadImageFolder', source: image.loadImageFolder });
    this.nodeTypes.push({ name: 'Load Movie', type: 'image.loadMovie', source: image.loadMovie });
    this.nodeTypes.push({ name: 'Lookup', type: 'image.lookup', source: image.lookup });
    this.nodeTypes.push({ name: 'Mask Ellipse', type: 'image.maskCircle', source: image.maskCircle });
    this.nodeTypes.push({ name: 'Mask Image', type: 'image.maskImage', source: image.maskImage });
    this.nodeTypes.push({ name: 'Mirror', type: 'image.mirror', source: image.mirror });
    this.nodeTypes.push({ name: 'Modulate Color', type: 'image.modulateColor', source: image.modulateColor });
    this.nodeTypes.push({ name: 'Null', type: 'image.null', source: image.null });
    this.nodeTypes.push({ name: 'Pixelate', type: 'image.pixelate', source: image.pixelate });
    this.nodeTypes.push({ name: 'Radial Distortion', type: 'image.radialDistortion', source: image.radialDistortion });
    this.nodeTypes.push({ name: 'Reduce Color', type: 'image.reduceColor', source: image.reduceColor });
    this.nodeTypes.push({ name: 'Squares', type: 'image.squares', source: image.squares });
    this.nodeTypes.push({ name: 'Resize', type: 'image.resize', source: image.resize });
    this.nodeTypes.push({ name: 'Save Image', type: 'image.saveImage', source: image.saveImage });
    this.nodeTypes.push({ name: 'Sharpen', type: 'image.sharpen', source: image.sharpen });
    this.nodeTypes.push({ name: 'Sobel', type: 'image.sobel', source: image.sobel });
    this.nodeTypes.push({ name: 'Stack', type: 'image.stack', source: image.stack });
    this.nodeTypes.push({ name: 'Threshold', type: 'image.threshold', source: image.threshold });
    this.nodeTypes.push({ name: 'Trail', type: 'image.trail', source: image.trail });
    this.nodeTypes.push({ name: 'Transform', type: 'image.transform', source: image.transform });
    this.nodeTypes.push({ name: 'Unsplash Image', type: 'image.unsplash', source: image.unsplash });
    this.nodeTypes.push({ name: 'Vignette', type: 'image.vignette', source: image.vignette });
    this.nodeTypes.push({ name: 'Webcam Image', type: 'image.webcamImage', source: image.webcamImage });

    // ML
    this.nodeTypes.push({ name: 'Detect Objects', type: 'ml.detectObjects', source: ml.detectObjects });
    // this.nodeTypes.push({ name: 'Detect Faces', type: 'ml.detectFacesBlazeFace', source: ml.detectFacesBlazeFace });
    this.nodeTypes.push({ name: 'Detect Faces', type: 'ml.detectFaces', source: ml.detectFaces });
    this.nodeTypes.push({ name: 'Detect Pose', type: 'ml.detectPose', source: ml.detectPose });
    this.nodeTypes.push({ name: 'Segment Pose', type: 'ml.segmentPose', source: ml.segmentPose });
    this.nodeTypes.push({ name: 'Detect Hands', type: 'ml.detectHands', source: ml.detectHands });
    this.nodeTypes.push({ name: 'Image to Image Model', type: 'ml.imageToImageModel', source: ml.imageToImageModel });

    // this.nodeTypes.push({ name: 'Segment Pose 2', type: 'ml.segmentPose2', source: ml.segmentPose2 });
    // this.nodeTypes.push({ name: 'Classify Image', type: 'ml.classifyImage', source: ml.classifyImage });
    // this.nodeTypes.push({ name: 'Pose Net', type: 'ml.poseNet', source: ml.poseNet });
    // this.nodeTypes.push({ name: 'Pose Body Part', type: 'ml.poseBodyPart', source: ml.poseBodyPart });
    // this.nodeTypes.push({ name: 'Draw Skeleton', type: 'ml.drawSkeleton', source: ml.drawSkeleton });
    // this.nodeTypes.push({ name: 'Teachable Machine', type: 'ml.teachableMachine', source: ml.teachableMachine });
    // this.nodeTypes.push({ name: 'Face Api', type: 'ml.faceApi', source: ml.faceApi });

    for (const nodeType of this.nodeTypes) {
      if (!nodeType.source) {
        throw new Error(`Node type ${nodeType.type} has no source`);
      }
      const description = nodeType.source.match(/\/\/(.*)/);
      if (description) {
        nodeType.description = description[1].trim();
      } else {
        nodeType.description = '';
      }
    }
  }

  findByType(type) {
    return this.nodeTypes.find((node) => node.type === type);
  }
}
