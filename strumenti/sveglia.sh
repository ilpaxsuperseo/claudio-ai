#!/bin/zsh
# La sveglia di riserva (LaunchAgent com.masrepassaro.nummo-sveglia, ogni ora al minuto 25): chiede a GitHub
# un controllo del ciclo. Il calendario di GitHub ritarda e salta le ore; un avvio diretto no.
# I doppioni non fanno danni: i cicli si mettono in fila e il mattino non si ripete.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin"
gh workflow run nummo.yml --repo ilpaxsuperseo/nummo -f ciclo=controlla && echo "$(date '+%F %H:%M') controllo chiesto"
