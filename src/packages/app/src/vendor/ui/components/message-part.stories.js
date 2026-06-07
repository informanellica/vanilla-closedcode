import * as mod from "./message-part.js";
import { create } from "../storybook/scaffold.js";
const story = create({
  title: "UI/MessagePart",
  mod
});
export default {
  title: "UI/MessagePart",
  id: "components-message-part",
  component: story.meta.component
};
export const Basic = story.Basic;