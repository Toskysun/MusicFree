jest.mock("react-native-fs", () => {
    const mockFs = {
        CachesDirectoryPath: "/tmp/cache",
        DocumentDirectoryPath: "/tmp/document",
        ExternalDirectoryPath: "/tmp/external",
        ExternalCachesDirectoryPath: "/tmp/external-cache",
        TemporaryDirectoryPath: "/tmp/temp",
        DownloadDirectoryPath: "/tmp/download",
        readDir: jest.fn(async () => []),
        readdir: jest.fn(async () => []),
        readFile: jest.fn(async () => ""),
        writeFile: jest.fn(async () => undefined),
        appendFile: jest.fn(async () => undefined),
        exists: jest.fn(async () => false),
        unlink: jest.fn(async () => undefined),
        copyFile: jest.fn(async () => undefined),
        mkdir: jest.fn(async () => undefined),
        stat: jest.fn(async path => ({
            path,
            isFile: () => true,
            isDirectory: () => false,
        })),
        read: jest.fn(async () => ""),
        stopDownload: jest.fn(),
        downloadFile: jest.fn(() => ({
            jobId: 1,
            promise: Promise.resolve({
                statusCode: 200,
                bytesWritten: 0,
            }),
        })),
    };

    return {
        ...mockFs,
        default: mockFs,
    };
});

jest.mock(
    "@react-native-async-storage/async-storage",
    () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@react-native-clipboard/clipboard", () => ({
    setString: jest.fn(),
    getString: jest.fn(async () => ""),
    hasString: jest.fn(async () => true),
}));

jest.mock("@/lib/react-native-vdebug/src/log", () => ({
    addLog: jest.fn(),
    traceLog: jest.fn(),
}));
