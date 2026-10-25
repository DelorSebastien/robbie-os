#!/bin/sh
# Construit Robbie Lien (l'appli Android) et la pose à côté du Téléphone, d'où Robbie OS la
# propose aux téléphones (Réglages › Téléphone). Outils : ~/android-outils (Java 17, SDK, Gradle).
# La clé de signature (robbie-lien.jks) reste dans ~/android-outils : les mises à jour doivent
# être signées par la même clé.
set -e
OUTILS="${ANDROID_OUTILS:-$HOME/android-outils}"
ICI="$(cd "$(dirname "$0")" && pwd)"
export JAVA_HOME="$OUTILS/jdk"
export ANDROID_HOME="$OUTILS/sdk"
export PATH="$JAVA_HOME/bin:$PATH"

CLE="${ROBBIE_LIEN_CLE:-$OUTILS/robbie-lien.jks}"
if [ ! -f "$CLE" ]; then
    keytool -genkeypair -keystore "$CLE" -alias robbie-lien -keyalg RSA -keysize 3072 -validity 10000 \
        -storepass "${ROBBIE_LIEN_MDP:-robbie-lien}" -keypass "${ROBBIE_LIEN_MDP:-robbie-lien}" -dname "CN=Robbie OS"
fi

# (le dossier des sources peut être en lecture seule : on construit dans une copie)
TRAVAIL="${TMPDIR:-/tmp}/robbie-lien-construction"
mkdir -p "$TRAVAIL"
cp -r "$ICI/." "$TRAVAIL/"
echo "sdk.dir=$ANDROID_HOME" > "$TRAVAIL/local.properties"
cd "$TRAVAIL"
"$OUTILS/gradle/bin/gradle" --no-daemon -q assembleRelease
cp app/build/outputs/apk/release/app-release.apk "${1:-$ICI/../robbie-lien.apk}"
echo "Robbie Lien construite : ${1:-$ICI/../robbie-lien.apk}"
