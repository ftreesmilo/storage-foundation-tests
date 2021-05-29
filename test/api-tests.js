import Promise from 'bluebird';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import NativeIOFileManager from '../NativeIOFileManager.js';

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
    const file = await open(name);
    await file.close();
    expect(await getRemainingCapacity()).to.equal(1024);
    await deleteFile(name);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('counts files with length toward capacity', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    const file = await open(name);
    await file.setLength(1024);
    await file.close();
    expect(await getRemainingCapacity()).to.equal(0);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('accounts for written capacity write (start of file)', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    const file = await open(name);
    const { writtenBytes } = await file.write(Buffer.alloc(512, 0xDD), 0);
    expect(writtenBytes).to.equal(512);
    await file.close();
    expect(await getRemainingCapacity()).to.equal(512);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });

  it('accounts for written capacity write (end of file)', async function () {
    const name = filename(this.test.fullTitle());
    expect(await requestCapacity(1024)).to.equal(1024);
    const file = await open(name);
    const { writtenBytes } = await file.write(Buffer.alloc(512, 0xDD), 512);
    expect(writtenBytes).to.equal(512);
    await file.close();
    expect(await getRemainingCapacity()).to.equal(0);
    await deleteFile(name);
    expect(await getRemainingCapacity()).to.equal(1024);
    expect(await releaseCapacity(1024)).to.equal(0);
  });
});
