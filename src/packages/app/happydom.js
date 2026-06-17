/**
 * @file Test/headless environment setup: registers happy-dom globals (document,
 * window, etc.) and patches HTMLCanvasElement.prototype.getContext with a no-op
 * 2D context mock, since happy-dom does not provide a real canvas rendering
 * context. Importing this module applies these side effects.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
// - we're overriding with a simplified mock
/**
 * Stub replacement for HTMLCanvasElement.prototype.getContext.
 *
 * For the "2d" context type it returns a mock CanvasRenderingContext2D whose
 * drawing methods are no-ops (and whose measureText approximates width as
 * eight pixels per character), so code that touches a 2D canvas runs without a
 * real rendering backend. Any other context type is delegated to the original
 * implementation.
 *
 * @param {string} contextType - Requested context identifier (e.g. "2d").
 * @param {*} _options - Context attributes; ignored by the 2D mock and only
 *   forwarded to the original getContext for non-2D types.
 * @returns {Object} The mock 2D context, or whatever the original getContext
 *   returns for non-2D context types.
 */
HTMLCanvasElement.prototype.getContext = function (contextType, _options) {
  if (contextType === "2d") {
    return {
      canvas: this,
      fillStyle: "#000000",
      strokeStyle: "#000000",
      font: "12px monospace",
      textAlign: "start",
      textBaseline: "alphabetic",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      shadowBlur: 0,
      shadowColor: "rgba(0, 0, 0, 0)",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: text => ({
        width: text.length * 8
      }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      rotate: () => {},
      translate: () => {},
      transform: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {}
      }),
      createRadialGradient: () => ({
        addColorStop: () => {}
      }),
      createPattern: () => null,
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      arcTo: () => {},
      ellipse: () => {},
      rect: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      isPointInPath: () => false,
      isPointInStroke: () => false,
      getTransform: () => ({}),
      getImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0
      }),
      putImageData: () => {},
      createImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0
      })
    };
  }
  return originalGetContext.call(this, contextType, _options);
};