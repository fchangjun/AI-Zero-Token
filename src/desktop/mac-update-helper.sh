#!/bin/bash
# Runs from the private update job, outside either app bundle. Never elevates.
set -eu
umask 077
export PATH=/usr/bin:/bin:/usr/sbin:/sbin

parent_pid="$1"
target="$2"
stage="$3"
job="$4"
token="$5"
case "$parent_pid" in ''|*[!0-9]*) exit 2 ;; esac
[ "$parent_pid" -gt 1 ] || exit 2
case "$target" in /*.app) ;; *) exit 2 ;; esac
case "$token" in ''|*[!a-f0-9-]*) exit 2 ;; esac
[ "$(dirname "$stage")" = "$(dirname "$target")" ] || exit 2
case "$(basename "$stage")" in .azt-update-*) ;; *) exit 2 ;; esac
[ -d "$stage" ] && [ ! -L "$stage" ] && [ -d "$job" ] && [ ! -L "$job" ] || exit 2
[ -d "$target" ] && [ ! -L "$target" ] && [ -d "$stage/new.app" ] || exit 2
[ ! -e "$stage/previous.app" ] && [ ! -e "$job/ack" ] || exit 2

new_pid=""
committed=0
parent_exited=0

write_result() {
  printf '%s\n' "$1" > "$job/result.tmp"
  mv "$job/result.tmp" "$job/result"
}

finish() {
  local result=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$committed" -eq 1 ]; then
    write_result success
    rm -rf "$stage"
    rm -f "$job/update.dmg"
    exit 0
  fi
  if [ -n "$new_pid" ] && kill -0 "$new_pid" 2>/dev/null; then
    kill -TERM "$new_pid" 2>/dev/null
    for ((i=0; i<10; i++)); do
      kill -0 "$new_pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$new_pid" 2>/dev/null
    wait "$new_pid" 2>/dev/null
  fi
  if [ -d "$stage/previous.app" ]; then
    if [ -e "$target" ]; then
      mv "$target" "$stage/failed.app" || { write_result recovery-required; exit 1; }
    fi
    mv "$stage/previous.app" "$target" || { write_result recovery-required; exit 1; }
    write_result rolled-back
    "$target/Contents/MacOS/AI Zero Token" >> "$job/relaunch.log" 2>&1 &
    rm -rf "$stage"
    rm -f "$job/update.dmg"
  else
    write_result failed
    if [ "$parent_exited" -eq 1 ] && [ -d "$target" ]; then
      "$target/Contents/MacOS/AI Zero Token" >> "$job/relaunch.log" 2>&1 &
    fi
  fi
  exit "${result:-1}"
}

trap finish EXIT
trap 'exit 1' HUP INT TERM
printf '%s\n' "$token" > "$job/helper-ready"

# Do not touch the installed app until its gateway and main process have exited.
for ((i=0; i<300; i++)); do
  if ! kill -0 "$parent_pid" 2>/dev/null; then parent_exited=1; break; fi
  sleep 1
done
[ "$parent_exited" -eq 1 ] || exit 1
[ ! -L "$target" ] && [ ! -L "$stage/new.app" ] || exit 1
mv "$target" "$stage/previous.app"
mv "$stage/new.app" "$target"

# Track the exact new process, so a failed launch never kills another user's app.
"$target/Contents/MacOS/AI Zero Token" "--azt-update-token=$token" >> "$job/relaunch.log" 2>&1 &
new_pid=$!
for ((i=0; i<90; i++)); do
  kill -0 "$new_pid" 2>/dev/null || exit 1
  if [ -f "$job/ack" ] && [ "$(cat "$job/ack")" = "$token" ]; then
    committed=1
    exit 0
  fi
  sleep 1
done
exit 1
