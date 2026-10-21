# Los 8 pacientes. Edad de MakeHuman (0 a 1): 0 → 1 año, 0,1875 → 11,
# 0,5 → 25 y 1 → 90 años (lineal en cada tramo). Todo sale de paquetes CC0
# de MakeHuman (ver CREDITOS.md).


def edad(anios):
    if anios <= 11:
        return (anios - 1) / 10 * 0.1875
    if anios <= 25:
        return 0.1875 + (anios - 11) / 14 * (0.5 - 0.1875)
    return 0.5 + (anios - 25) / 65 * 0.5


URUGUAY = {"caucasian": 0.85, "african": 0.08, "asian": 0.07}

PERSONAJES = {
    "senor-mayor": {
        "phenotype": {"gender": 1.0, "age": edad(72), "weight": 0.6,
                      "muscle": 0.4, "height": 0.45, "race": URUGUAY},
        "skin": "old_caucasian_male",
        "hair": "short04",
        "eyebrows": "eyebrow001",
        "clothes": ["male_casualsuit03", "shoes02"],
        "canas": 0.85,
    },
    "senora-mayor": {
        "phenotype": {"gender": 0.0, "age": edad(70), "weight": 0.6,
                      "muscle": 0.35, "height": 0.4, "race": URUGUAY},
        "skin": "old_caucasian_female",
        "hair": "rehmanpolanski_hair_bun_brown",
        "eyebrows": "eyebrow002",
        "clothes": ["toigo_wool_pants", "toigo_fisherman_sweater", "toigo_ballet_flats"],
        "canas": 0.8,
    },
    "hombre-adulto": {
        "phenotype": {"gender": 1.0, "age": edad(42), "weight": 0.55,
                      "muscle": 0.55, "height": 0.55, "race": URUGUAY},
        "skin": "middleage_caucasian_male",
        "hair": "short01",
        "eyebrows": "eyebrow003",
        "clothes": ["male_casualsuit01", "shoes01"],
    },
    "mujer-adulta": {
        "phenotype": {"gender": 0.0, "age": edad(40), "weight": 0.5,
                      "muscle": 0.45, "height": 0.5, "race": URUGUAY},
        "skin": "middleage_caucasian_female",
        "hair": "toigo_curled_under_bob",
        "eyebrows": "eyebrow010",
        "clothes": ["female_elegantsuit01", "toigo_flats"],
    },
    "hombre-joven": {
        "phenotype": {"gender": 1.0, "age": edad(22), "weight": 0.45,
                      "muscle": 0.6, "height": 0.6, "race": URUGUAY},
        "skin": "young_caucasian_male",
        "hair": "short02",
        "eyebrows": "eyebrow004",
        "clothes": ["male_casualsuit05", "shoes03"],
    },
    "mujer-joven": {
        "phenotype": {"gender": 0.0, "age": edad(22), "weight": 0.45,
                      "muscle": 0.5, "height": 0.5, "race": URUGUAY},
        "skin": "young_caucasian_female",
        "hair": "long01",
        "eyebrows": "eyebrow011",
        "clothes": ["toigo_basic_tucked_t-shirt", "toigo_wool_pants", "toigo_ballet_flats"],
    },
    "nino": {
        "phenotype": {"gender": 1.0, "age": edad(8), "weight": 0.5,
                      "muscle": 0.5, "height": 0.5, "race": URUGUAY},
        "skin": "young_caucasian_male",
        "hair": "short02",
        "eyebrows": "eyebrow005",
        "clothes": ["male_casualsuit06", "shoes01"],
    },
    "nina": {
        "phenotype": {"gender": 0.0, "age": edad(8), "weight": 0.5,
                      "muscle": 0.5, "height": 0.5, "race": URUGUAY},
        "skin": "young_caucasian_female",
        "hair": "toigo_blunt_bob_with_bangs",
        "eyebrows": "eyebrow006",
        "clothes": ["toigo_dress_with_tiered_skirt", "toigo_ballet_flats"],
    },
}
