#!/bin/bash
set -e  # Exit on any error

echo "🚀 Starting release process..."

echo "🧹 Cleaning up: Removing old dist directory..."
rm -rf dist/

echo "🗑️  Cleaning up: Removing old release branch if it exists..."
git branch -D release 2>/dev/null || true

echo "🌱 Creating new release branch..."
git checkout -b release

echo "📦 Building pip package..."
./scripts/build_pip.sh

echo "📁 Creating release directory and copying wheel files..."
mkdir -p release
cp dist/*.whl release/

echo "💾 Committing changes..."
git add .
git commit -m "Cut release"

echo "⬆️  Pushing release branch..."
git push origin release --force-with-lease

echo "↩️  Switching back to main branch..."
git checkout main

echo "✅ Release process completed successfully!"
