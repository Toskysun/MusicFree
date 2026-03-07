import type { ComponentType } from "react";
import AlbumContentItem from "./albumContentItem";
import MusicContentItem from "./musicContentItem";

const content: Record<IArtist.ArtistMediaType, ComponentType<any>> =
    {
        music: MusicContentItem,
        album: AlbumContentItem,
    } as const;

export default content;
