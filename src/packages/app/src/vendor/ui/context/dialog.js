// The app mounts the DialogProvider from @/lib/dialog.js (see app.js). Re-export
// the dialog context from that single source so vendor UI components (e.g.
// message-part's UserMessageDisplay) consume the SAME dialog context the app
// provides — otherwise "useDialog must be used within a DialogProvider".
// The useDialog API ({ active, show(element, onClose), close }) is identical.
export { DialogProvider, useDialog } from "@/lib/dialog.js";
