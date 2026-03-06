---
title: "Structuring your Figment project"
---

# Structuring your Figment project

## Relative Paths

Where possible, Figment will try to use relative paths. This only works if the file is saved first.

## Out Node

When rendering full screen, the last node should be the "Out" node. However, the Out node currently takes whatever input it gets and stretches it. Make sure the node before that is a "resize" node that is set to the resolution of the screen.