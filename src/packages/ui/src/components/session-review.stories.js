import * as mod from "./session-review.js";
import { create } from "../storybook/scaffold.js";
const story = create({
  title: "UI/SessionReview",
  mod
});
export default {
  title: "UI/SessionReview",
  id: "components-session-review",
  component: story.meta.component
};
export const Basic = story.Basic;