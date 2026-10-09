#!/bin/bash
# Double-click this file in Finder to start Tinta.
cd "$(dirname "$0")"

if command -v python3 &> /dev/null; then
  python3 serve.py
elif command -v python &> /dev/null; then
  python serve.py
else
  echo "Python was not found on this Mac."
  echo "Install it from https://www.python.org/downloads/ and try again."
  read -p "Press Enter to close..."
fi
