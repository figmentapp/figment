import { core, math, graphics, color, image, ml } from './sources';

export default class Library {
  constructor() {
    this.nodeTypes = [];
    // Core
    this.nodeTypes.push({ name: 'Sequence', type: 'core.sequence', source: core.sequence });
    this.nodeTypes.push({ name: 'Time', type: 'core.time', source: core.time });
    this.nodeTypes.push({ name: 'Random Number', type: 'core.randomNumber', source: core.randomNumber });
    this.nodeTypes.push({ name: 'Animate', type: 'core.animate', source: core.animate });
    this.nodeTypes.push({ name: 'Smooth', type: 'core.smooth', source: core.smooth });
    this.nodeTypes.push({ name: 'Mouse', type: 'core.mouse', source: core.mouse });
    this.nodeTypes.push({
      name: 'Conditional Trigger',
      type: 'core.conditionalTrigger',
      source: core.conditionalTrigger
    });
    this.nodeTypes.push({ name: 'Custom', type: 'core.custom', source: core.custom });

    // Math
    this.nodeTypes.push({ name: 'Convert', type: 'math.convert', source: math.convert });

    // Graphics
    this.nodeTypes.push({ name: 'Canvas', type: 'graphics.canvas', source: graphics.canvas });
    this.nodeTypes.push({
      name: 'Draw Background',
      type: 'graphics.backgroundColor',
      source: graphics.backgroundColor
    });
    this.nodeTypes.push({ name: 'Rectangle', type: 'graphics.rect', source: graphics.rect });
    this.nodeTypes.push({ name: 'Line', type: 'graphics.line', source: graphics.line });
    this.nodeTypes.push({ name: 'Transform', type: 'graphics.transform', source: graphics.transform });
    this.nodeTypes.push({ name: 'Clone', type: 'graphics.clone', source: graphics.clone });
    this.nodeTypes.push({ name: 'Draw Text', type: 'graphics.text', source: graphics.text });

    // Color
    this.nodeTypes.push({ name: 'HSL Color', type: 'color.hsl', source: color.hsl });

    // Image
    this.nodeTypes.push({ name: 'Load Image', type: 'image.loadImage', source: image.loadImage });
    this.nodeTypes.push({ name: 'Draw Image', type: 'image.drawImage', source: image.drawImage });
    this.nodeTypes.push({ name: 'Webcam Image', type: 'image.camImage', source: image.camImage });
    this.nodeTypes.push({ name: 'Pixels', type: 'image.pixels', source: image.pixels });
    this.nodeTypes.push({ name: 'Unsplash Image', type: 'image.unsplash', source: image.unsplash });

    this.nodeTypes.push({ name: 'Constant', type: 'image.constant', source: image.constant });
    this.nodeTypes.push({ name: 'Greyscale', type: 'image.greyscale', source: image.greyscale });
    this.nodeTypes.push({ name: 'Invert', type: 'image.invert', source: image.invert });
    this.nodeTypes.push({ name: 'Mirror', type: 'image.mirror', source: image.mirror });
    this.nodeTypes.push({ name: 'Modcolor', type: 'image.modcolor', source: image.modcolor });
    this.nodeTypes.push({ name: 'Sobel', type: 'image.sobel', source: image.sobel });
    this.nodeTypes.push({ name: 'Treshold', type: 'image.threshold', source: image.threshold });

    // ML
    this.nodeTypes.push({ name: 'Classify Image', type: 'ml.classifyImage', source: ml.classifyImage });
    this.nodeTypes.push({ name: 'Pose Net', type: 'ml.poseNet', source: ml.poseNet });
    this.nodeTypes.push({ name: 'Pose Body Part', type: 'ml.poseBodyPart', source: ml.poseBodyPart });
    this.nodeTypes.push({ name: 'Draw Skeleton', type: 'ml.drawSkeleton', source: ml.drawSkeleton });
    this.nodeTypes.push({ name: 'Teachable Machine', type: 'ml.teachableMachine', source: ml.teachableMachine });
    this.nodeTypes.push({ name: 'Face Api', type: 'ml.faceApi', source: ml.faceApi });

    for (const nodeType of this.nodeTypes) {
      const description = nodeType.source.match(/\/\/(.*)/);
      if (description) {
        nodeType.description = description[1].trim();
      } else {
        nodeType.description = '';
      }
    }
  }

  findByType(type) {
    return this.nodeTypes.find(node => node.type === type);
  }
}
