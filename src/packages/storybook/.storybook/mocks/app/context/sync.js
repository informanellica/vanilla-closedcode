import { createStore } from "solid-js/store";
const [data, setData] = createStore({
  session: [],
  permission: {},
  question: {},
  session_diff: {},
  message: {
    "story-session": []
  },
  session_status: {},
  agent: [{
    name: "build",
    mode: "task",
    hidden: false
  }],
  command: [{
    name: "fix",
    description: "Run fix command",
    source: "project"
  }]
});
export function useSync() {
  return {
    data,
    set(...input) {
      ;
      setData(...input);
    },
    session: {
      get(id) {
        return {
          id
        };
      },
      optimistic: {
        add() {},
        remove() {}
      }
    }
  };
}