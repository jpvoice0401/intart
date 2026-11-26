import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {join,relative} from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const source=join(root,'node_modules','@8thwall','engine-binary')
const target=join(root,'public','vendor','8thwall')
const metadata=JSON.parse(await readFile(join(source,'package.json'),'utf8'))
if(metadata.version!=='1.0.0')throw new Error('Expected @8thwall/engine-binary@1.0.0. Review the SDK integration before changing its version.')
await mkdir(target,{recursive:true})
await cp(join(source,'dist'),target,{recursive:true,force:true})
await cp(join(source,'README.md'),join(target,'README.md'),{force:true})
const files={}
async function record(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name)
    if(entry.isDirectory())await record(path)
    else{
      const data=await readFile(path)
      files[relative(join(source,'dist'),path).replaceAll('\\','/')]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}
    }
  }
}
await record(join(source,'dist'))
await writeFile(join(target,'provenance.json'),JSON.stringify({package:metadata.name,version:metadata.version,source:'https://github.com/8thwall/engine',license:'XR Engine License Agreement; see LICENSE',files},null,2)+'\n')
console.log(`Copied original 8th Wall ${metadata.version} engine assets and license to public/vendor/8thwall (${Object.keys(files).length} files).`)
