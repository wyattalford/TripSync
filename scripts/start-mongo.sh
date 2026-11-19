#!/bin/sh
set -eu

podman compose up -d mongo

attempt=0
while [ "$attempt" -lt 30 ]; do
  if podman compose exec -T mongo mongosh --quiet -u dev -p dev --authenticationDatabase admin --eval 'try { if (rs.status().ok === 1 && db.hello().isWritablePrimary) quit(0); quit(1) } catch (error) { rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]}); quit(1) }' >/dev/null 2>&1; then
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "MongoDB replica set did not become ready" >&2
exit 1
