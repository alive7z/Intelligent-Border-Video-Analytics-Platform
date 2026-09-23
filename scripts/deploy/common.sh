#!/bin/sh

deployment_root() {
  CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd
}

env_value() {
  key="$1"
  file="$2"
  awk -v wanted="$key" '
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/\r$/, "", line)
      separator = index(line, "=")
      if (!separator) next
      name = substr(line, 1, separator - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == wanted) {
        value = substr(line, separator + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
            (substr(value, 1, 1) == "\047" && substr(value, length(value), 1) == "\047")) {
          value = substr(value, 2, length(value) - 2)
        }
        print value
        exit
      }
    }
  ' "$file"
}

resolve_host_path() {
  candidate="$1"
  root="$2"
  case "$candidate" in
    /*) printf '%s\n' "$candidate" ;;
    *) printf '%s/%s\n' "$root" "${candidate#./}" ;;
  esac
}

profile_enabled() {
  profile="$1"
  profiles="$2"
  case ",$profiles," in
    *",$profile,"*) return 0 ;;
    *) return 1 ;;
  esac
}
