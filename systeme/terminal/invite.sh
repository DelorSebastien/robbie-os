# Invite de commande de Robbie OS, en pastilles : la personne (cyan), le dossier (violet),
# la branche git (magenta, ✔ si tout est enregistré, ● sinon), la durée si la commande a été
# longue ; puis ❯ sur la ligne suivante, rouge avec une pastille d'erreur si la commande a échoué.
# Chargée par ~/.bashrc ; les bouts arrondis et les icônes viennent de la police Symbols Nerd Font.

case $- in *i*) ;; *) return 0 ;; esac
[ -n "$BASH_VERSION" ] || return 0

__robbie_gauche=$''
__robbie_droite=$''
__robbie_icone_personne=$''
__robbie_icone_dossier=$''
__robbie_icone_branche=$''
__robbie_icone_duree=$''

# Couleurs (rouge;vert;bleu) : celles des boutons des fenêtres de Robbie OS
__robbie_cyan='94;231;255'
__robbie_violet='185;140;255'
__robbie_magenta='255;110;200'
__robbie_rouge='255;107;139'
__robbie_texte='10;18;36'

# Ajoute une pastille à l'invite : $1 couleur, $2 texte
__robbie_pastille() {
    __robbie_ps+="\[\e[38;2;$1m\]${__robbie_gauche}\[\e[48;2;$1m\e[38;2;${__robbie_texte}m\] $2 \[\e[0m\e[38;2;$1m\]${__robbie_droite}\[\e[0m\] "
}

# Texte sûr dans l'invite : bash réinterprète $, ` et \ (un dossier nommé « $(…) » ne doit rien lancer)
__robbie_sur() {
    local texte=${1//\\/\\\\}
    texte=${texte//\$/\\\$}
    printf '%s' "${texte//\`/\\\`}"
}

# Dossier : ~ pour le dossier personnel, et seulement les trois derniers niveaux s'il est profond
__robbie_dossier() {
    local dossier=${PWD/#$HOME/\~}
    local IFS=/
    local -a parties=($dossier)
    if [ ${#parties[@]} -gt 4 ]; then
        dossier="…/${parties[*]: -3}"
    fi
    __robbie_sur "${dossier:-/}"
}

__robbie_invite() {
    local statut=$?
    local duree=$(( EPOCHSECONDS - ${__robbie_debut:-$EPOCHSECONDS} ))
    unset __robbie_debut

    __robbie_ps="\[\e]0;Terminal — \w\a\]\[\e[90m\]╭─\[\e[0m\] "
    __robbie_pastille "$__robbie_cyan" "${__robbie_icone_personne} \u"
    __robbie_pastille "$__robbie_violet" "${__robbie_icone_dossier} $(__robbie_dossier)"

    local branche
    branche=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    if [ -n "$branche" ]; then
        local etat='✔'
        [ -n "$(git status --porcelain --ignore-submodules 2>/dev/null | head -n 1)" ] && etat='●'
        __robbie_pastille "$__robbie_magenta" "${__robbie_icone_branche} $(__robbie_sur "$branche") ${etat}"
    fi

    [ "$statut" -ne 0 ] && __robbie_pastille "$__robbie_rouge" "✘ ${statut}"

    if [ "$duree" -ge 3 ]; then
        local texte="${duree}s"
        [ "$duree" -ge 60 ] && texte="$((duree / 60))m$(printf '%02d' $((duree % 60)))s"
        __robbie_ps+="\[\e[90m\]${__robbie_icone_duree} ${texte}\[\e[0m\]"
    fi

    # (flèche et traits : couleurs de la palette du terminal, lisibles en clair comme en sombre)
    local fleche=36
    [ "$statut" -ne 0 ] && fleche=31
    PS1="${__robbie_ps}\n\[\e[90m\]╰─\[\e[1;${fleche}m\]❯\[\e[0m\] "
}

# Début de chaque commande, pour mesurer sa durée
trap '[ -z "$__robbie_debut" ] && __robbie_debut=$EPOCHSECONDS' DEBUG
PROMPT_COMMAND=__robbie_invite

# Couleurs de ls et grep, et quelques raccourcis pratiques
alias ls='ls --color=auto --group-directories-first'
alias ll='ls -lh'
alias la='ls -lhA'
alias grep='grep --color=auto'
