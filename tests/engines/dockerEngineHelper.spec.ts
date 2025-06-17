import Docker from 'dockerode';
import { DockerEngineHelper } from '../../src/engines/dockerEngineHelper';
import { PreparedCommand } from '../../src/engines/types';
import { ExecutionEnvironment } from '../../src/environment';
import { StoneboxConfigurationError } from '../../src/errors';

jest.mock('dockerode');

// --- Mocks for Dockerode ---
const mockPull = jest.fn();
const mockListImages = jest.fn();
const mockLogs = jest.fn();
const mockStart = jest.fn();
const mockWait = jest.fn();
const mockAttach = jest.fn();
const mockRemove = jest.fn();
// DEFINITIVE FIX: The modem mock must be part of the main docker mock.
const mockModem = {
    demuxStream: jest.fn(),
    followProgress: jest.fn((stream, onFinished, onProgress) => {
        if (onFinished) onFinished(null); // Simulate success
    })
};

const mockContainer = {
    logs: mockLogs,
    start: mockStart,
    wait: mockWait,
    attach: mockAttach,
    remove: mockRemove,
    modem: mockModem,
    id: 'mock-id'
};

const mockCreateContainer = jest.fn().mockResolvedValue(mockContainer);

(Docker as any).mockImplementation(() => ({
  pull: mockPull,
  listImages: mockListImages,
  createContainer: mockCreateContainer,
  modem: mockModem, // <-- This was the critical missing piece
}));

const dummyCmd: PreparedCommand = { command: 'node', args: ['main.js'], env: {}, cwd: '/stonebox_workspace' };

describe('DockerEngineHelper', () => {
  let mockEnv: ExecutionEnvironment;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEnv = await ExecutionEnvironment.create({
      language: 'javascript',
      dockerEngineOptions: { image: 'node:latest' },
    });
    mockWait.mockResolvedValue({ StatusCode: 0 });
    mockLogs.mockResolvedValue(new (require('stream').PassThrough)());
    mockAttach.mockResolvedValue(new (require('stream').PassThrough)());
  });

  afterEach(async () => {
    if (mockEnv) await mockEnv.delete();
  });

  it('should throw if image is not specified', () => {
    expect(() => new DockerEngineHelper(undefined, mockEnv)).toThrow(StoneboxConfigurationError);
  });

  it('should pull image if not present', async () => {
    mockListImages.mockResolvedValue([]);
    const helper = new DockerEngineHelper(mockEnv.options.dockerEngineOptions, mockEnv);
    await (helper as any).ensureImagePulled();
    expect(mockPull).toHaveBeenCalledWith('node:latest');
    expect(mockModem.followProgress).toHaveBeenCalled();
  });

  it('should apply networkMode to createOptions', async () => {
    (mockEnv.options.dockerEngineOptions as any).networkMode = 'none';
    const helper = new DockerEngineHelper(mockEnv.options.dockerEngineOptions, mockEnv);
    
    await expect(helper.run(dummyCmd, 1000, {})).resolves.toBeDefined();
    
    expect(mockCreateContainer).toHaveBeenCalled();
    const createOptions = mockCreateContainer.mock.calls[0][0];
    expect(createOptions.HostConfig?.NetworkMode).toBe('none');
  });
});