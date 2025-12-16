#!/usr/bin/env python3
"""Script para capturar salida de comandos git"""
import subprocess
import sys
import os

repo_path = r"C:\Users\fever\Media Fees Lead Automation\mfs-lead-generation-ai"
os.chdir(repo_path)

commands = [
    ("git remote -v", "Remoto configurado"),
    ("git status", "Estado del repositorio"),
    ("git log --oneline -3", "Últimos 3 commits"),
    ("git ls-remote origin HEAD", "Verificar conexión con GitHub"),
]

for cmd, description in commands:
    print(f"\n{'='*60}")
    print(f"{description}: {cmd}")
    print('='*60)
    try:
        result = subprocess.run(
            cmd.split(),
            capture_output=True,
            text=True,
            cwd=repo_path,
            timeout=30
        )
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        print(f"Exit code: {result.returncode}")
    except Exception as e:
        print(f"Error: {e}")

