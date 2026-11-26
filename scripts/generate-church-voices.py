"""Generate fixed Korean exclamations; no character names or user data are sent.

Build-time only: py -m pip install --target .tools/church-audio edge-tts
Then: py scripts/generate-church-voices.py
"""
import asyncio
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'church-audio'))
import edge_tts

async def main():
    output = ROOT / 'public' / 'audio' / 'church'
    output.mkdir(parents=True, exist_ok=True)
    for gender, voice in [('male', 'ko-KR-InJoonNeural'), ('female', 'ko-KR-SunHiNeural')]:
        for phrase, text in [('amen', '아멘!'), ('lord', '주여!')]:
            destination = output / f'{gender}-{phrase}.mp3'
            await edge_tts.Communicate(text, voice, rate='-12%', pitch='+18Hz', volume='+0%').save(str(destination))
            print(f'{destination.name}: {destination.stat().st_size} bytes', flush=True)

asyncio.run(main())
