# Publishing Guide

This project uses an automated CI/CD pipeline with three separate GitHub Actions workflows for maximum security and isolation.

## 🚀 Workflow Overview

### 1. CI Pipeline (`.github/workflows/ci.yml`)

**Trigger:** Every push to `main` and all pull requests  
**Permissions:** `contents: read`, `pull-requests: write`  
**Purpose:** Build, test, lint, and auto-fix formatting

- ✅ Runs on every PR and main branch push
- 🔧 Auto-fixes formatting on PRs only (commits back to PR branch)
- ❌ Fails on main if formatting issues exist (requires manual fix)
- 🔒 **Never pushes to main branch** - maintains main branch protection
- 🛡️ Minimal permissions for security

### 2. Auto-Publish Pipeline (`.github/workflows/auto-publish.yml`)

**Trigger:** After CI passes on main branch  
**Permissions:** `contents: write`, `id-token: write`  
**Purpose:** Automatically publish when version bumps are detected

- 🔍 Runs only after CI passes on main
- 📦 Publishes to NPM when `package.json` version > published version
- 🏷️ Creates Git tags and GitHub releases
- 🚀 **Never bumps versions** - only publishes existing version changes
- 🔒 Only publishes, never modifies code

### 3. Manual Publish Pipeline (`.github/workflows/manual-publish.yml`)

**Trigger:** Manual workflow dispatch  
**Permissions:** `contents: write`, `id-token: write`  
**Purpose:** Manual version bumping and publishing with dry-run support

- 👤 Manually triggered from GitHub Actions UI
- 🔢 Supports patch/minor/major version bumps
- 🔍 Includes dry-run mode for testing
- 📝 Commits version bump to main
- 📦 Publishes to NPM after version bump

## 🔄 How It Works

### Development Workflow

1. **Create PR** → CI runs with auto-formatting
2. **Merge to main** → CI runs again
3. **Manual version bump** (via Manual Publish workflow)
4. **Auto-publish** detects version change and publishes

### Key Security Features

- 🛡️ **Workflow Isolation**: Each workflow has minimal required permissions
- 🔒 **No Code Modification in Auto-Publish**: Only reads and publishes
- 🚫 **Protected Main Branch**: Auto-publish never pushes code changes
- 🏷️ **Tag-Only Automation**: Auto-publish only creates tags, not commits

### Publishing Process

#### Option 1: Manual Publish (Recommended)

1. Go to **Actions** → **Manual Publish**
2. Click **Run workflow**
3. Select version bump type (patch/minor/major)
4. Optionally enable dry-run for testing
5. Workflow will version bump and publish automatically

#### Option 2: Manual Version Bump + Auto-Publish

1. Manually update `package.json` version
2. Commit and push to main
3. Auto-publish will detect the version change and publish

## 🔧 Required Setup

### 1. NPM Token Setup

To publish to NPM, you need to set up an NPM access token:

1. **Create NPM Account**: If you don't have one, create an account at [npmjs.com](https://www.npmjs.com/)

2. **Generate Access Token**:

   ```bash
   npm login
   npm token create --type=granular --scope=@your-scope
   ```

   Or use the NPM website:

   - Go to [NPM Access Tokens](https://www.npmjs.com/settings/tokens)
   - Click "Generate New Token"
   - Choose "Granular Access Token"
   - Set appropriate permissions for publishing

3. **Add Token to GitHub Secrets**:
   - Go to your GitHub repository
   - Navigate to: Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your NPM access token

### 2. Repository Permissions

**✅ Default Setup (Recommended)**  
The workflows are designed to work with default GitHub permissions. No additional setup should be needed.

**🔧 If You Encounter Permission Issues:**

1. **Go to Repository Settings** → **Actions** → **General**
2. **Workflow permissions**: Select "Read and write permissions"
3. **Allow GitHub Actions to create and approve pull requests**: ✅ Check this

### 3. Package Configuration

Make sure your `package.json` has the correct configuration:

```json
{
  "name": "@your-scope/wgsl-template",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

## 🛡️ Security & Troubleshooting

### Common Issues

**CI Permission Errors:**

- Error: `permission denied to github-actions[bot]`
- Solution: Enable "Read and write permissions" in Settings → Actions → General

**Auto-Publish Not Triggered:**

- Ensure CI passes first
- Check that `package.json` version > published NPM version
- Verify `NPM_TOKEN` secret is configured

**Manual Publish Failures:**

- Check NPM token permissions
- Ensure package name is unique
- Use dry-run mode to test first

### Monitoring

Check the **Actions** tab in your GitHub repository to monitor:

- ✅ CI build status and test results
- 📦 Auto-publish status and version detection
- 🔧 Manual publish executions and results

### Manual Recovery

If auto-publishing fails, use the Manual Publish workflow:

1. Go to **Actions** → **Manual Publish**
2. Click **Run workflow**
3. Select version bump type
4. Optionally enable dry-run to test
5. Execute the workflow
