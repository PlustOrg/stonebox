import Docker from 'dockerode';
import { DockerEngineHelper } from '../../src/engines/dockerEngineHelper';
import { StoneboxRuntimeError, StoneboxTimeoutError } from '../../src/errors';
import { ExecutionTask, PreparedCommand } from '../../src/engines/types';

jest.mock('dockerode');

const mockCreateContainer = jest.fn();
const mockPull = jest.fn();
const mockListImages = jest.fn();
const mockAttach = jest.fn();
const mockStart = jest.fn();
const mockWait = jest.fn();
const mockStop = jest.fn();
const mockKill = jest.fn();
const mockRemove = jest.fn();
const mockDemuxStream = jest.fn();

(Docker as any).mockImplementation(() => ({
  createContainer: mockCreateContainer,
  pull: mockPull,
  listImages: mockListImages,
  modem: { followProgress: (_s: any, cb: any) => cb(null), demuxStream: mockDemuxStream },
}));

const dummyTask: ExecutionTask = {
  files: new Map(),
  entrypoint: 'main.js',
  options: {},
  tempPath: '/tmp/fake',
};
const dummyCmd: PreparedCommand = {
  command: 'node',
  args: ['main.js'],
  env: {},
  cwd: '/stonebox_workspace',
};

describe('DockerEngineHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw if image is not specified', () => {
    expect(() => new DockerEngineHelper({ image: '' } as any, dummyTask)).toThrow('Docker image must be specified');
  });

  it('should pull image if not present', async () => {
    mockListImages.mockResolvedValue([]);
    mockPull.mockResolvedValue('pullStream');
    const helper = new DockerEngineHelper({ image: 'node:18-alpine' }, dummyTask);
    await expect((helper as any).ensureImagePulled()).resolves.toBeUndefined();
    expect(mockPull).toHaveBeenCalledWith('node:18-alpine');
  });

  it('should not pull image if present and policy is IfNotPresent', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:18-alpine' }, dummyTask);
    await expect((helper as any).ensureImagePulled()).resolves.toBeUndefined();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it('should throw on pull error', async () => {
    mockListImages.mockResolvedValue([]);
    mockPull.mockRejectedValue(new Error('pull fail'));
    const helper = new DockerEngineHelper({ image: 'fail-image' }, dummyTask);
    await expect((helper as any).ensureImagePulled()).rejects.toThrow('Failed to pull Docker image');
  });

  it('should throw on container create error', async () => {
    mockListImages.mockResolvedValue([{}]);
    mockCreateContainer.mockRejectedValue(new Error('create fail'));
    const helper = new DockerEngineHelper({ image: 'node:18-alpine' }, dummyTask);
    await expect(helper.runInContainer(dummyCmd, 1000)).rejects.toThrow('Failed to create Docker container');
  });
});
