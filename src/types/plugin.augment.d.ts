declare namespace IPlugin {
  // Augment IMediaSourceResult to optionally carry ekey for mflac sources
  interface IMediaSourceResult {
    ekey?: string;
  }
}

