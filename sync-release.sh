#!/bin/bash

lastSyncVersion=$(cat .lastsync)
versionsRequest=$(curl --silent -X GET https://raw.githubusercontent.com/react-native-community/rn-diff-purge/master/RELEASES)

# Break the versions into an array
SAVEIFS=$IFS
IFS=$'\n'
versions=($versionsRequest)
IFS=$SAVEIFS

versionsLength=${#array[@]}

for (( i=0; i < ${#versions[@]}; i++ ))
do
  version=${versions[$i]}

  # Only continue if the version is bigger than the last synced
  if (( $(awk 'BEGIN {print ("'$version'" < "'$lastSyncVersion'")}') )); then  
    continue;
  fi

  # Create label
  curl --silent -X POST https://api.github.com/repos/react-native-community/upgrade-support/labels \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$version\", \"color\": \"cfd3d7\"}" \
    -H "Authorization: bearer $GITHUB_TOKEN"

  # Save the last version synced
  if [[ "$i" -eq "$versionsLength" ]]; then
    echo $version > .lastsync
  fi
done
