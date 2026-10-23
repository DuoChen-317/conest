#!/usr/bin/env python3
"""Import a curated selection from locally purchased LimeZu packs. No third-party dependencies."""
import argparse, json, struct, zipfile
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--interiors',required=True,type=Path)
p.add_argument('--office',required=True,type=Path)
p.add_argument('--output',type=Path,default=Path('data/scene-assets'))
a=p.parse_args()
# Explicit selection avoids extracting arbitrary archive paths or executable tools.
items={
 'office.png':('office','Modern_Office_16x16.png'),
 'room.png':('office','1_Room_Builder_Office/Room_Builder_Office_16x16.png'),
 'library.png':('interiors','1_Interiors/16x16/Theme_Sorter/5_Classroom_and_library_16x16.png'),
 'book.png':('interiors','2_Characters/Character_Generator/Books/16x16/Book_01.png'),
 'license-interiors.txt':('interiors','LICENSE.txt'),
 'license-office.txt':('office','LICENSE.txt'),
}
for i,n in enumerate([1,5,12]):
 items[f'person-{i}.png']=('interiors',f'2_Characters/Character_Generator/0_Premade_Characters/16x16/Premade_Character_{n:02}.png')
for n in [98, 99, 103, 104, 116, 124, 129, 130, 142, 149, 153, 165, 170, 171, 173, 174, 200, 228, 242, 263]:
 items[f'office-{n}.png']=('office',f'4_Modern_Office_singles/16x16/Modern_Office_Singles_{n}.png')
archives={'office':zipfile.ZipFile(a.office),'interiors':zipfile.ZipFile(a.interiors)}
try:
 content={name:archives[kind].read(path) for name,(kind,path) in items.items()}
 images={}
 for name,data in content.items():
  if name.endswith('.png'):
   if data[:8]!=b'\x89PNG\r\n\x1a\n': raise ValueError(f'Invalid PNG: {name}')
   w,h=struct.unpack('>II',data[16:24])
   if w>4096 or h>4096 or len(data)>4*1024*1024: raise ValueError(f'Unexpected image: {name}')
   images[name]={'width':w,'height':h}
 a.output.mkdir(parents=True,exist_ok=True)
 for name,data in content.items(): (a.output/name).write_bytes(data)
 manifest={'version':1,'available':True,'credit':'LimeZu · Modern Interiors / Modern Office','images':images,'characters':['person-0.png','person-1.png','person-2.png']}
 temp=a.output/'manifest.json.tmp';temp.write_text(json.dumps(manifest,indent=2)+'\n');temp.replace(a.output/'manifest.json')
 print(f'Imported {len(images)} images into {a.output.resolve()}. Purchased source assets remain outside Git.')
finally:
 for z in archives.values():z.close()
