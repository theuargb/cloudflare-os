#!/bin/bash

git branch -D trunk-backup
git checkout trunk
git checkout -b trunk-backup
git branch -D trunk

git checkout main
git fetch fork
git pull

git checkout -b trunk

git merge feat-extend-context-actor-info
git merge feat-ai-ui-parity-main
git merge fix-sidebar-scrolling-main
# git merge fork/fix-gatekeepers-iframe-switch-hung
git merge smtk-branding-main
git merge localization

git push --force fork trunk
