import { describe, expect, test } from "@jest/globals";
import { formatServerError, parseReadableConfigInvalidError } from "./server-errors.js";
function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined) return "";
    return String(value);
  });
}
function useLanguageMock() {
  const dict = {
    "error.chain.unknown": "Erro desconhecido",
    "error.chain.configInvalid": "Arquivo de config em {{path}} invalido",
    "error.chain.configInvalidWithMessage": "Arquivo de config em {{path}} invalido: {{message}}",
    "error.chain.modelNotFound": "Modelo nao encontrado: {{provider}}/{{model}}",
    "error.chain.didYouMean": "Voce quis dizer: {{suggestions}}",
    "error.chain.checkConfig": "Revise provider/model no config"
  };
  return {
    t(key, vars) {
      const text = dict[key];
      if (!text) return key;
      return fill(text, vars);
    }
  };
}
const language = useLanguageMock();
describe("parseReadableConfigInvalidError", () => {
  test("formats issues with file path", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        path: "closedcode.config.ts",
        issues: [{
          path: ["settings", "host"],
          message: "Required"
        }, {
          path: ["mode"],
          message: "Invalid"
        }]
      }
    };
    const result = parseReadableConfigInvalidError(error, language.t);
    expect(result).toBe(["Arquivo de config em closedcode.config.ts invalido: settings.host: Required", "mode: Invalid"].join("\n"));
  });
  test("uses trimmed message when issues are missing", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        path: "config",
        message: "  Bad value  "
      }
    };
    const result = parseReadableConfigInvalidError(error, language.t);
    expect(result).toBe("Arquivo de config em config invalido: Bad value");
  });
});
describe("formatServerError", () => {
  test("formats config invalid errors", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        message: "Missing host"
      }
    };
    const result = formatServerError(error, language.t);
    expect(result).toBe("Arquivo de config em config invalido: Missing host");
  });
  test("returns error messages", () => {
    expect(formatServerError(new Error("Request failed with status 503"), language.t)).toBe("Request failed with status 503");
  });
  test("returns provided string errors", () => {
    expect(formatServerError("Failed to connect to server", language.t)).toBe("Failed to connect to server");
  });
  test("uses translated unknown fallback", () => {
    expect(formatServerError(0, language.t)).toBe("Erro desconhecido");
  });
  test("falls back for unknown error objects and names", () => {
    expect(formatServerError({
      name: "ServerTimeoutError",
      data: {
        seconds: 30
      }
    }, language.t)).toBe("Erro desconhecido");
  });
  test("formats provider model errors using provider/model", () => {
    const error = {
      name: "ProviderModelNotFoundError",
      data: {
        providerID: "openai",
        modelID: "gpt-4.1"
      }
    };
    expect(formatServerError(error, language.t)).toBe(["Modelo nao encontrado: openai/gpt-4.1", "Revise provider/model no config"].join("\n"));
  });
  test("formats provider model suggestions", () => {
    const error = {
      name: "ProviderModelNotFoundError",
      data: {
        providerID: "x",
        modelID: "y",
        suggestions: ["x/y2", "x/y3"]
      }
    };
    expect(formatServerError(error, language.t)).toBe(["Modelo nao encontrado: x/y", "Voce quis dizer: x/y2, x/y3", "Revise provider/model no config"].join("\n"));
  });
});