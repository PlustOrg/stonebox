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
    const helper = new DockerEngineHelper({ image: 'node:latest' }, dummyTask);
    await expect((helper as any).ensureImagePulled()).resolves.toBeUndefined();
    expect(mockPull).toHaveBeenCalledWith('node:latest');
  });

  it('should not pull image if present and policy is IfNotPresent', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest' }, dummyTask);
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
    const helper = new DockerEngineHelper({ image: 'node:latest' }, dummyTask);
    await expect(helper.runInContainer(dummyCmd, 1000)).rejects.toThrow('Failed to create Docker container');
  });

  it('should apply networkMode to HostConfig', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', networkMode: 'none' }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.NetworkMode).toBe('none');
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });

  it('should apply workspaceMountMode as ro', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', workspaceMountMode: 'ro' }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.Binds[0]).toMatch(/:ro$/);
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });

  it('should apply cpu and pids limits', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', cpuShares: 512, cpuPeriod: 100000, cpuQuota: 50000, pidsLimit: 10 }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.CpuShares).toBe(512);
      expect(opts.HostConfig.CpuPeriod).toBe(100000);
      expect(opts.HostConfig.CpuQuota).toBe(50000);
      expect(opts.HostConfig.PidsLimit).toBe(10);
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });

  it('should apply capDrop and capAdd', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', capDrop: ['ALL'], capAdd: ['SYS_PTRACE'] }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.CapDrop).toEqual(['ALL']);
      expect(opts.HostConfig.CapAdd).toEqual(['SYS_PTRACE']);
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });

  it('should apply noNewPrivileges', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', noNewPrivileges: true }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.SecurityOpt).toContain('no-new-privileges');
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });

  it('should apply readonlyRootfs', async () => {
    mockListImages.mockResolvedValue([{}]);
    const helper = new DockerEngineHelper({ image: 'node:latest', readonlyRootfs: true }, dummyTask);
    mockCreateContainer.mockImplementation((opts) => {
      expect(opts.HostConfig.ReadonlyRootfs).toBe(true);
      return { attach: jest.fn(), start: jest.fn(), wait: jest.fn().mockResolvedValue([{ StatusCode: 0 }]), id: 'cid', remove: jest.fn() };
    });
    await expect(helper.runInContainer(dummyCmd, 1000)).resolves.toBeDefined();
  });
});
