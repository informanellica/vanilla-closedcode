import { createSimpleContext } from "./helper.js";
const ctx = createSimpleContext({
  name: "FileComponent",
  init: props => props.component
});
export const FileComponentProvider = ctx.provider;
export const useFileComponent = ctx.use;