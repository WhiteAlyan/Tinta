#!/bin/bash
# Run this file to start Tinta: ./Launch\ Tinta\ \(Linux\).sh
# (Most Linux file managers need "Allow executing as program" checked in
# the file's Properties before double-click will run it — see README.)
cd "$(dirname "$0")"

if command -v python3 &> /dev/null; then
  python3 serve.py
elif command -v python &> /dev/null; then
  python serve.py
else
  echo "Python 3 was not found."
  echo "Install it with your package manager (e.g. sudo apt install python3) and try again."
  read -p "Press Enter to close..."
fi
