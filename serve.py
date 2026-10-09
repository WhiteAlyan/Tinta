#!/usr/bin/env python3
"""
Tinta launcher.

Double-click "Launch Tinta" (Mac/Windows) or run this file directly
to start a local server and open the app in your default browser.

Why this exists: Tinta uses ES modules and a service worker, both of
which require a real http:// origin — double-clicking index.html directly
(file://) will not work correctly.
"""
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser


def find_free_port(start=8080, end=8180):
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise RuntimeError(f'No free port found in range {start}-{end}')


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    try:
        port = find_free_port()
    except RuntimeError as e:
        print(f'Could not find a free port: {e}')
        input('Press Enter to close...')
        sys.exit(1)

    socketserver.TCPServer.allow_reuse_address = True
    handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(('127.0.0.1', port), handler)

    url = f'http://127.0.0.1:{port}/'
    print('=' * 50)
    print('  Tinta is running')
    print(f'  {url}')
    print()
    print('  Leave this window open while you work.')
    print('  Close this window (or press Ctrl+C) to stop.')
    print('=' * 50)

    # Open the browser shortly after the server starts listening.
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping Tinta...')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
