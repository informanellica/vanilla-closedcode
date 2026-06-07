import * as mod from "./session-turn.js";
import { create } from "../storybook/scaffold.js";
const story = create({
  title: "UI/SessionTurn",
  mod
});
export default {
  title: "UI/SessionTurn",
  id: "components-session-turn",
  component: story.meta.component
};
export const Basic = story.Basic;