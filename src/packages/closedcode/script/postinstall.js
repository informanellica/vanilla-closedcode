#!/usr/bin/env node

/** @file npm postinstall hook that locates the platform-specific closedcode binary package and links its executable into bin/ on non-Windows platforms (no-op on Windows, which ships a packaged .exe). */
import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Determine the current platform and architecture, normalized to the naming scheme used by the closedcode binary packages.
 * @returns {Object} An object with `platform` (e.g. "darwin", "linux", "windows") and `arch` (e.g. "x64", "arm64", "arm") string fields.
 */
function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

/**
 * Resolve the installed platform-specific binary package and locate its executable on disk.
 * @returns {Object} An object with `binaryPath` (absolute path to the executable) and `binaryName` (the executable filename).
 * @throws {Error} When the platform package cannot be resolved or the expected binary file does not exist.
 */
function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `closedcode-${platform}-${arch}`
  const binaryName = platform === "windows" ? "closedcode.exe" : "closedcode"

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binaryName)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return { binaryPath, binaryName }
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`, { cause: error })
  }
}

/**
 * Postinstall entry point: on Windows it does nothing (the packaged .exe is used directly); on other platforms it hard-links (falling back to copy) the resolved binary into bin/.closedcode and marks it executable.
 * @returns {Promise<void>} A promise that resolves when setup completes; exits the process with code 1 on failure.
 */
async function main() {
  try {
    if (os.platform() === "win32") {
      // On Windows, the .exe is already included in the package and bin field points to it
      // No postinstall setup needed
      console.log("Windows detected: binary setup not needed (using packaged .exe)")
      return
    }

    // On non-Windows platforms, just verify the binary package exists
    // Don't replace the wrapper script - it handles binary execution
    const { binaryPath } = findBinary()
    const target = path.join(__dirname, "bin", ".closedcode")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
    } catch {
      fs.copyFileSync(binaryPath, target)
    }
    fs.chmodSync(target, 0o755)
  } catch (error) {
    console.error("Failed to setup closedcode binary:", error.message)
    process.exit(1)
  }
}

try {
  void main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
