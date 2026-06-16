/** @file Defines the FileComponent context (provider + hook) exposing the file-rendering component supplied via props. */
import { createSimpleContext } from "./helper.js";
const ctx = createSimpleContext({
  name: "FileComponent",
  init: props => props.component
});
export const FileComponentProvider = ctx.provider;
export const useFileComponent = ctx.use;