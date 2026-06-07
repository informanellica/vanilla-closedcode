// The app consolidated the vendor contexts into @/lib/context.js and mounts the
// providers from there (e.g. directory-layout's DataProvider). Re-export the
// Data context from that single source so vendor UI components consume the SAME
// context object the app provides (otherwise: "Data context must be used within
// a context provider").
export { useData, DataProvider } from "@/lib/context.js";
