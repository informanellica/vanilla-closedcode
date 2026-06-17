/** @file Example plugin registering a "folder" workspace type backed by a blank local temp directory. */
import { mkdir, rm } from "node:fs/promises";
/**
 * Example workspace plugin that registers a "folder" workspace backed by a blank temp directory.
 * @param {Object} ctx - Plugin context.
 * @param {Object} ctx.experimental_workspace - Workspace registry used to register the workspace type.
 * @returns {Promise<Object>} A promise resolving to the plugin's hooks (empty here).
 */
export const FolderWorkspacePlugin = async ({
  experimental_workspace
}) => {
  experimental_workspace.register("folder", {
    name: "Folder",
    description: "Create a blank folder",
    /**
     * Returns the config augmented with a randomized temp directory for the new workspace.
     * @param {Object} config - The base workspace configuration.
     * @returns {Object} The configuration extended with a "directory" path.
     */
    configure(config) {
      const rand = "" + Math.random();
      return {
        ...config,
        directory: `/tmp/folder/folder-${rand}`
      };
    },
    /**
     * Creates the workspace directory on disk if a directory is configured.
     * @param {Object} config - The workspace configuration containing the directory path.
     * @returns {Promise<void>} A promise that resolves once the directory exists.
     */
    async create(config) {
      if (!config.directory) return;
      await mkdir(config.directory, {
        recursive: true
      });
    },
    /**
     * Recursively removes the workspace directory from disk.
     * @param {Object} config - The workspace configuration containing the directory path.
     * @returns {Promise<void>} A promise that resolves once the directory is removed.
     */
    async remove(config) {
      await rm(config.directory, {
        recursive: true,
        force: true
      });
    },
    /**
     * Describes the workspace target: a local directory.
     * @param {Object} config - The workspace configuration containing the directory path.
     * @returns {Object} A target descriptor with type "local" and the directory path.
     */
    target(config) {
      return {
        type: "local",
        directory: config.directory
      };
    }
  });
  return {};
};
export default FolderWorkspacePlugin;