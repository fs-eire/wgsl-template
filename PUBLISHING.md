# GitHub Actions Setup for CI/CD Pipeline

This project uses GitHub Actions for both Continuous Integration (CI) and automatic publishing to NPM.

## 🔄 CI Pipeline (ci.yml)

**Triggers**:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Process**:

1. **Install**: `npm ci`
2. **Build**: `npm run build`
3. **Lint**: `npm run lint`
4. **Format Check**: `npm run format`
   - **For Pull Requests**: Auto-fix formatting issues and commit to PR branch
   - **For Main Branch**: Fail the job (no auto-fix, requires manual fix)
   - **Always**: Fail the CI job if formatting issues exist
5. **Test**: `npm test` (only if no formatting issues)

**Auto-Format Behavior**:

- **Pull Requests**:
  - Detects unformatted files
  - Automatically runs Prettier to fix formatting
  - Commits fixes to the PR branch with `[skip ci]`
  - **Fails the CI job** to require review of formatting changes
- **Main Branch**:
  - Detects unformatted files
  - **Fails the CI job** without auto-fixing
  - Requires manual `npm run format` and commit
  - **Prevents auto-publish** from running with unformatted code

## 🚀 Auto-Publishing Pipeline (auto-publish.yml)

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

### 2. Package Configuration

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

## 🚀 How It Works

### Automatic Publishing (auto-publish.yml)

**Triggers**: Every push to `main` branch (excluding README, docs changes)

**Version Bump Logic**:

- **MAJOR**: Commit messages containing "breaking" or "major"
- **MINOR**: Commit messages containing "feat", "feature", or "minor"
- **PATCH**: All other commits (default)

**Process**:

1. Install dependencies and run tests
2. Build the project
3. Determine version bump type from commit messages
4. Bump version in package.json
5. Commit and tag the new version
6. Publish to NPM
7. Create GitHub release

### Manual Publishing (manual-publish.yml)

**Triggers**: Manual workflow dispatch

**Features**:

- Choose version bump type (patch/minor/major)
- Option to skip tests
- Manual control over publishing

## 📝 Commit Message Guidelines

To control version bumping, use these keywords in your commit messages:

```bash
# Patch version (1.0.0 → 1.0.1)
git commit -m "fix: resolve template parsing issue"
git commit -m "docs: update README"

# Minor version (1.0.0 → 1.1.0)
git commit -m "feat: add new code generator"
git commit -m "feature: implement template caching"

# Major version (1.0.0 → 2.0.0)
git commit -m "breaking: change API interface"
git commit -m "major: redesign template system"
```

## 🛡️ Safety Features

- **Prevents Double Publishing**: Skips if commit message contains "chore: bump version"
- **Test Validation**: Runs full test suite before publishing
- **Build Verification**: Ensures project builds successfully
- **Git History**: Maintains clean git history with version tags

## 🔍 Monitoring

Check the Actions tab in your GitHub repository to monitor:

- Build status
- Test results
- Publishing success/failure
- Version bump details

## 🚨 Troubleshooting

**Common Issues**:

1. **NPM_TOKEN Invalid**: Regenerate NPM token and update GitHub secret
2. **Permission Denied**: Ensure NPM token has publish permissions
3. **Version Conflict**: Check if version already exists on NPM
4. **Git Push Failed**: Ensure GitHub token has write permissions

**Manual Recovery**:
If auto-publishing fails, use the manual workflow:

1. Go to Actions tab
2. Select "Manual Publish" workflow
3. Click "Run workflow"
4. Choose version bump type and run
