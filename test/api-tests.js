import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import NativeIOFileManager from 'storage-foundation-chunk-store/NativeIOFileManager.js';

const {
  open,
  delete: deleteFile,
  getAll,
  releaseCapacity,
  requestCapacity,
  getRemainingCapacity,
} = NativeIOFileManager;

chai.use(asPromised);
const { expect } = chai;

/**
 * @param {string} name
 * @returns {string}
 */
const filename = (name) => name.replace(/[^a-zA-Z0-9_]/g, '_');

describe('api', function () {
  beforeEach(async function () {
    await Promise.each(getAll(), deleteFile);
    const capacity = await getRemainingCapacity();
    if (capacity) {
      console.warn(`uncollected capacity: ${capacity}`);
      await releaseCapacity(capacity);
    }
    expect(await getAll()).to.deep.equal([]);
    expect(await getRemainingCapacity()).to.equal(0);
  });

  afterEach(async function () {
    expect(await getAll()).to.deep.equal([]);
    expect(await getRemainingCapacity()).to.equal(0);
  });

  it('requests capacity', async function () {
    expect(await requestCapacity(1024)).to.equal(1024);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('does not count unwritten files toward capacity', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    await Promise.using(open(name), async () => {});
    expect(await getRemainingCapacity()).to.equal(1024);
    await deleteFile(name);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('counts files with length toward capacity', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    await Promise.using(open(name), (file) => file.setLength(1024));
    expect(await getRemainingCapacity()).to.equal(0);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('accounts for written capacity write (start of file)', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    await Promise.using(open(name), async (file) => {
      const { writtenBytes } = await file.write(Buffer.alloc(512, 0xDD), 0);
      expect(writtenBytes).to.equal(512);
    });
    expect(await getRemainingCapacity()).to.equal(512);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('accounts for written capacity write (end of file)', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    await Promise.using(open(name), async (file) => {
      const { writtenBytes } = await file.write(Buffer.alloc(512, 0xDD), 512);
      expect(writtenBytes).to.equal(512);
    });
    expect(await getRemainingCapacity()).to.equal(0);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('can be used to read while writing', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    await Promise.using(open(name), async (file) => {
      const { writtenBytes } = await file.write(Buffer.alloc(512, 0xDD), 512);
      expect(writtenBytes).to.equal(512);
      const { buffer, readBytes } = await file.read(Buffer.alloc(512), 512);
      expect(readBytes).to.equal(512);
      expect(buffer).to.deep.equal(Buffer.alloc(512, 0xDD));
    });
    await deleteFile(name);
    await releaseCapacity(1024);
  });
});
