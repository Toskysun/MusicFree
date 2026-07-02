declare namespace IPlugin {
  // Augment IMediaSourceResult to optionally carry ekey for mflac sources
  interface IMediaSourceResult {
    ekey?: string;
    /** CENC AES-CTR content key (16-byte hexadecimal string). */
    cek?: string;
  }
}

