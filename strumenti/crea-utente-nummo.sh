#!/bin/zsh
# Crea l'utente macOS «nummo», la casa notturna di Nummo. Si lancia UNA volta, da Luca:
#   sudo zsh ~/ai-workspace/prodotti/nummo/strumenti/crea-utente-nummo.sh
# Utente standard (non amministratore), nascosto dalla schermata di accesso, con una password
# casuale che nessuno conosce: non si entra come lui, ci si passa solo dal turno di notte.
# Serve a separare il portachiavi: da un utente suo, Nummo non vede quello di Luca.
# Luca può eseguire comandi come nummo senza password: è un passo indietro nei permessi, mai avanti.
set -e
[ "$(id -u)" = 0 ] || { echo "Va lanciato con sudo davanti."; exit 1; }
LUCA=lucamasrepassaro
CASA=/Users/Shared/nummo-casa

if ! id nummo >/dev/null 2>&1; then
  sysadminctl -addUser nummo -fullName "Nummo" -password "$(openssl rand -base64 32)" -home /Users/nummo -shell /bin/zsh
  createhomedir -c -u nummo >/dev/null
  dscl . create /Users/nummo IsHidden 1
fi
chmod 700 /Users/nummo
chown -R nummo:staff "$CASA"

echo "$LUCA ALL=(nummo) NOPASSWD: ALL" > /etc/sudoers.d/nummo
chmod 440 /etc/sudoers.d/nummo
visudo -cf /etc/sudoers.d/nummo >/dev/null

sudo -u "$LUCA" sudo -n -u nummo whoami >/dev/null && echo "Fatto: l'utente nummo esiste e la casa è sua."
