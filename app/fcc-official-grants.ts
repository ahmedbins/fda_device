export type OfficialFccGrantBand = {
  lowMhz: string;
  highMhz: string;
  outputWatts?: string;
  ruleParts?: string;
};

export type OfficialFccGrantEnrichment = {
  equipmentClasses: string[];
  descriptions: string[];
  bands: OfficialFccGrantBand[];
};

/** Official EAS search/grant fields captured 2026-08-17 from FCC ID Search results and TCB/EAS grant pages. */
export const FCC_OFFICIAL_GRANT_CAPTURED_AT = "2026-08-17T15:16:00.000Z";
export const FCC_OFFICIAL_GRANT_SOURCE = "FCC Equipment Authorization System ID Search and Grant of Equipment Authorization";

export const FCC_OFFICIAL_GRANTS: Record<string, OfficialFccGrantEnrichment> = 
{
  "2A3ULACAEBT": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULACPAEBT": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULAOWS1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULATW1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULBTA1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULBTD600": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULBTD700": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULBTT100": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULCONCPLUS1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULCX200TW1L": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULCX200TW1R": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULCXPLUSTW1L": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULCXPLUSTW1R": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULHDBT": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULHDR195": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULHDR275": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULM4AEBT": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULM5AEBT": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULMSPORT1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULMTW3L": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULMTW3R": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULMTW4": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULMTW5": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "2404.0",
        "highMhz": "2478.0"
      }
    ]
  },
  "2A3ULOTW1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULRR2000": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULRR5000": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULRRFLEX": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULSB01": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2404.0",
        "highMhz": "2476.0"
      }
    ]
  },
  "2A3ULSB02M": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULSEBT4": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULSW02": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULTR120W": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULTR195": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULTR2000": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULTR5000": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2406.0",
        "highMhz": "2474.0"
      }
    ]
  },
  "2A3ULTVC2C": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULTVC2EB": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "2A3ULTVC2TX": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-ARNEM": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-ARNESP": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-BIO": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless communicator with hearing devices"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-BPR": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-BPZ": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-BSP": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-BSR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-BST": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity and rechargeable battery"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-BTD1": {
    "equipmentClasses": [
      "Digital Transmission System"
    ],
    "descriptions": [
      "Wireless Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0009",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-BTER": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-BTEVSP": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-BTEVUP": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-CCG": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": []
  },
  "KWC-CCL": {
    "equipmentClasses": [
      "Part 18 Consumer Device"
    ],
    "descriptions": [
      "Wireless charger"
    ],
    "bands": [
      {
        "lowMhz": "0.125",
        "highMhz": "0.125"
      }
    ]
  },
  "KWC-CLICKNTALK": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Dongle"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-COMPILOT1": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Streamer and Remote Control for Hearing Aids"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-COMPILOT11": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "The Wireless Functional Test (WFT) device"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0018",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-COMPILOT2": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-CONDOR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "915.25",
        "highMhz": "927.25"
      }
    ]
  },
  "KWC-CPAIR2": {
    "equipmentClasses": [
      "Digital Transmission System",
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Streamer & remote control device"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00337",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "10.579",
        "highMhz": "10.579",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-DSF5K": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Sound Reinforcement System"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0",
        "outputWatts": "0.0015",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-DSFX": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-EC1": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Phonak EasyCall"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-EC2": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Phonak EasyCall II"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-ERF": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless hearing aid"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.000139",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-HGO": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-HUB": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Station Transmitter"
    ],
    "descriptions": [
      "Inspiro Audio hub"
    ],
    "bands": [
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875",
        "outputWatts": "0.005"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-ICOM1": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless Fitting Device"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00121",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-ICUBE1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      },
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-ICUBE2": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Fitting Interface"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00476",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-IND": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-INR": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-IRF": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-IRP": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-ITEV10": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-ITEV10O": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-ITEV13": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-LDR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-LDZ": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless hearing aid"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-MRP": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-MYPILOT1": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Remote Control Device"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-MZP": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing aid with wireless connectivity"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-NLCROS": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Accessory for CI sound processor"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-PILOTONE1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      },
      {
        "lowMhz": "0.039",
        "highMhz": "0.043"
      },
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096"
      }
    ]
  },
  "KWC-PILOTONE2": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-PRF": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-PRL": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-RC1": {
    "equipmentClasses": [
      "Digital Transmission System"
    ],
    "descriptions": [
      "Remote Control"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.001",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-RICR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-RX24": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless SoundField loudspeaker"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00646",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-SLR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-TVCONNECTOR": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-TVCONNECTV2": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-TVLINK2": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Phonak TVLink S basestation"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.01",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-TVLINKII": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Phonak TVLink II base"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0304",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-TWE21": {
    "equipmentClasses": [
      "Digital Transmission System"
    ],
    "descriptions": [
      "Charging case for wireless audio earbuds"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00094",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-TWE21EB": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless audio earbuds"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00478",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-TX23RCV1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "434.05",
        "highMhz": "434.05"
      }
    ]
  },
  "KWC-TX23V1": {
    "equipmentClasses": [
      "Communications Receiver used w/Pt 15 Transmitter"
    ],
    "descriptions": [
      "Wireless Microphone"
    ],
    "bands": [
      {
        "lowMhz": "434.05",
        "highMhz": "434.05",
        "ruleParts": "15B"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-TX29V1": {
    "equipmentClasses": [
      "Digital Transmission System",
      "Communications Receiver used w/Pt 15 Transmitter"
    ],
    "descriptions": [
      "Wireless Microphone (ALD)"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0417",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "434.05",
        "highMhz": "434.05",
        "ruleParts": "15B"
      }
    ]
  },
  "KWC-VTI": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-VTJ": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing instrument"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-VTP": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWC-WFT1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSBTE": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSBTE1": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSBTE1U": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSBTEM": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSBTEP": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSBTESP": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSITE": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSITE1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSRIC1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSRIC2": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSRIC3": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSRIC4": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Hearing Aid"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSSAN": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSSAN1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6"
      }
    ]
  },
  "KWC-WHSSANQ": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC-WHSSANT": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Wireless Hearing Instrument"
    ],
    "bands": [
      {
        "lowMhz": "10.6",
        "highMhz": "10.6",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC001R": {
    "equipmentClasses": [
      "Communications Receiver used w/Pt 15 Transmitter"
    ],
    "descriptions": [
      "Audio Assistance Receiver"
    ],
    "bands": [
      {
        "lowMhz": "72.0",
        "highMhz": "73.0",
        "ruleParts": "15B"
      },
      {
        "lowMhz": "74.6",
        "highMhz": "74.8",
        "ruleParts": "15B"
      },
      {
        "lowMhz": "75.2",
        "highMhz": "76.0",
        "ruleParts": "15B"
      }
    ]
  },
  "KWC001T": {
    "equipmentClasses": [
      "Unkown (From ALTOS)"
    ],
    "descriptions": [
      "Audio Assistance Transmitter"
    ],
    "bands": [
      {
        "lowMhz": "72.0",
        "highMhz": "73.0",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "74.6",
        "highMhz": "74.8",
        "ruleParts": "15C"
      },
      {
        "lowMhz": "75.2",
        "highMhz": "76.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWC002R": {
    "equipmentClasses": [
      "Communications Rcvr for use w/ licensed Tx and CBs"
    ],
    "descriptions": [
      "Auditory Assistance Receiver"
    ],
    "bands": [
      {
        "lowMhz": "216.0",
        "highMhz": "217.0",
        "ruleParts": "15B"
      }
    ]
  },
  "KWC002T": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Transmitter Worn on Body"
    ],
    "descriptions": [
      "Rated frequency range corresponds to Standard Band channels 1 thru 18 under Section 95.629(b)."
    ],
    "bands": [
      {
        "lowMhz": "216.012",
        "highMhz": "216.438",
        "outputWatts": "0.0003"
      }
    ]
  },
  "KWC003R": {
    "equipmentClasses": [
      "Communications Rcvr for use w/ licensed Tx and CBs"
    ],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "216.0",
        "highMhz": "217.0",
        "ruleParts": "15B"
      }
    ]
  },
  "KWC004T": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Station Transmitter"
    ],
    "descriptions": [
      "Auditory Assistance Transmitter"
    ],
    "bands": [
      {
        "lowMhz": "216.012",
        "highMhz": "216.98",
        "outputWatts": "0.02"
      }
    ]
  },
  "KWCAC": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCACC04": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Remote Control for Wireless bodyworn transmitter to provide the audio received by a connected radio or a Bluetooth mobile phone wirelessly to an ear-level receiver."
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00062",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCBWRXD": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCCAMPUS": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Station Transmitter"
    ],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "216.0",
        "highMhz": "217.0",
        "outputWatts": "0.0002"
      }
    ]
  },
  "KWCCTX": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "0.374",
        "highMhz": "0.374"
      }
    ]
  },
  "KWCDMBASE": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Studio transmitter"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.04",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCDME": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCDRX": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCMYLINKD": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCNCC": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Audio and control signal transceiver"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCPROFILO": {
    "equipmentClasses": [
      "Part 15 Low Power Transmitter Below 1705 kHz"
    ],
    "descriptions": [
      "Very short distance wireless audio link to ear"
    ],
    "bands": [
      {
        "lowMhz": "0.375",
        "highMhz": "0.375",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCR20": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCR21": {
    "equipmentClasses": [
      "Part 15 Low Power Communication Device Transmitter"
    ],
    "descriptions": [
      "Roger 21 - Audio and control signal transceiver"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCRCI": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "0.039",
        "highMhz": "0.043"
      }
    ]
  },
  "KWCRF": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCRX23": {
    "equipmentClasses": [
      "Digital Transmission System"
    ],
    "descriptions": [
      "Wireless audio transceiver"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00072",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCSE": {
    "equipmentClasses": [
      "Digital Transmission System"
    ],
    "descriptions": [
      "Wireless audio transceiver"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.00072",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTELCOM": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Station Transmitter"
    ],
    "descriptions": [
      "Auditory Assistance Transmitter"
    ],
    "bands": [
      {
        "lowMhz": "216.0",
        "highMhz": "217.0",
        "outputWatts": "0.0085"
      }
    ]
  },
  "KWCTVLINK1": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Phonak TVLink basestation"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0178",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX10": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCTX14": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      },
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096"
      },
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875"
      }
    ]
  },
  "KWCTX15": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      }
    ]
  },
  "KWCTX17": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "remote microphone for hearing impaired people"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.011",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX17-1V1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX18": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX18-1V1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX19": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX20": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Auditory Assistance Device for Hearing impaired people"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.062",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX21": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Auditory Assistance Device for Hearing impaired people"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.055",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX22": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "remote microphone for hearing impaired people"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0575",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX26": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless bodyworn transmitter for providing the audio received by a connected radio or a Bluetooth mobile phone wirelessly to an ear-level receiver"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.0029",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX27": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless microphone"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.044",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX28V1": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX300V": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "174.0",
        "highMhz": "216.0"
      }
    ]
  },
  "KWCTX32": {
    "equipmentClasses": [
      "Part 15 Spread Spectrum Transmitter"
    ],
    "descriptions": [
      "Wireless microphone"
    ],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0",
        "outputWatts": "0.04",
        "ruleParts": "15C"
      }
    ]
  },
  "KWCTX33": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX6": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875"
      },
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096"
      },
      {
        "lowMhz": "2402.0",
        "highMhz": "2480.0"
      }
    ]
  },
  "KWCTX7": {
    "equipmentClasses": [
      "Licensed Non-Broadcast Transmitter Worn on Body"
    ],
    "descriptions": [
      "Auditory Assistance Device"
    ],
    "bands": [
      {
        "lowMhz": "174.0",
        "highMhz": "216.0"
      },
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875",
        "outputWatts": "0.01"
      },
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096"
      }
    ]
  },
  "KWCTX9": {
    "equipmentClasses": [],
    "descriptions": [],
    "bands": [
      {
        "lowMhz": "2402.0",
        "highMhz": "2481.0"
      },
      {
        "lowMhz": "216.0125",
        "highMhz": "216.9875"
      },
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096"
      }
    ]
  },
  "KWCWALLP": {
    "equipmentClasses": [
      "Part 15 Low Power Transmitter Below 1705 kHz"
    ],
    "descriptions": [
      "Phonak WallPilot"
    ],
    "bands": [
      {
        "lowMhz": "0.04096",
        "highMhz": "0.04096",
        "ruleParts": "15C"
      }
    ]
  }
}
;
