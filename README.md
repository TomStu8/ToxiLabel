# ToxiLabel

Multimodálny anotačný nástroj pre detekciu toxického obsahu v slovenskom jazyku.
Vytvorený v rámci bakalárskej práce na Fakulte elektrotechniky a informatiky
Technickej univerzity v Košiciach.

## O projekte
ToxiLabel je webová aplikácia ktorá umožňuje paralelnú anotáciu textových,
obrazových a video dát viacerými anotátormi súčasne. Nástroj implementuje
dvojkrokovú anotačnú schému s dvanástimi kategóriami toxicity, podporuje
hromadné prideľovanie úloh, automatické generovanie prepisov pomocou OCR
a Whisper, a poskytuje dashboard pre meranie zhody medzi anotátormi
prostredníctvom Cohenovej kappy.

## Hlavné funkcie
- Dvojkroková anotačná schéma (Toxické/Netoxické + 12 kategórií)
- Tri typy projektov: text, obraz, video
- JWT autentifikácia s rolami administrátor a anotátor
- OCR pre obrázky (Tesseract) a prepis reči pre videá (faster-whisper large-v3)
- IAA dashboard s výpočtom Cohenovej kappy a PDF exportom
- Export anotácií vo formátoch JSON, CSV a Mix JSON (agregovaný s majority voting)
- AI anotátori: Claude Sonnet API a GPT-4o API

## Technologický stack
- **Backend:** FastAPI (Python 3.11), SQLAlchemy, Alembic
- **Frontend:** React, Vite, Tailwind CSS
- **Databáza:** PostgreSQL 16
- **Nasadenie:** Docker, docker-compose, Nginx

## Rýchle spustenie
### Predpoklady
- Docker a docker-compose
- Git

### Inštalácia
```bash
git clone https://github.com/tomstu8/ToxiLabel.git
cd ToxiLabel
cp .env.example .env
docker-compose up --build
```
Aplikácia bude dostupná na http://localhost

## Autor
**Tomáš Štupák**
Bakalárska práca, FEI TUKE 2026
Vedúci práce: Ing. Zuzana Sokolová, PhD.

## Licencia
MIT License
