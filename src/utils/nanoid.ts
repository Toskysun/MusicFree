// Use the non-secure build on React Native to avoid Metro resolving nanoid's node:crypto entry.
export { nanoid } from "nanoid/non-secure";
