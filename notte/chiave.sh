#!/bin/sh
# La chiave API di Nummo, letta da .env fuori dalla sua casa: Claude Code la chiede a questo script
# (apiKeyHelper), così non passa mai dall'ambiente dei comandi che Nummo lancia.
grep '^ANTHROPIC_API_KEY=' "$(dirname "$0")/../.env" | cut -d= -f2-
