/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/origina.json`.
 */
export type Origina = {
  "address": "8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi",
  "metadata": {
    "name": "origina",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "acceptAuthority",
      "discriminator": [
        107,
        86,
        198,
        91,
        33,
        12,
        107,
        160
      ],
      "accounts": [
        {
          "name": "newAuthority",
          "signer": true
        },
        {
          "name": "registryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "anchorMedia",
      "discriminator": [
        220,
        44,
        0,
        102,
        212,
        172,
        156,
        66
      ],
      "accounts": [
        {
          "name": "provider",
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "signer": true,
          "optional": true
        },
        {
          "name": "providerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "provenanceRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  100,
                  105,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              },
              {
                "kind": "arg",
                "path": "fileSha256"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "fileSha256",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "perceptual",
          "type": {
            "option": {
              "defined": {
                "name": "perceptualHash"
              }
            }
          }
        },
        {
          "name": "c2paManifestHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "generatedAt",
          "type": {
            "option": "i64"
          }
        }
      ]
    },
    {
      "name": "approveProvider",
      "discriminator": [
        165,
        155,
        246,
        4,
        44,
        27,
        206,
        6
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "registryAccount"
          ]
        },
        {
          "name": "registryAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "providerApproval",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112,
                  114,
                  111,
                  118,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "providerAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "provider",
          "type": "pubkey"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "c2paCertIdentity",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "cancelAuthorityTransfer",
      "discriminator": [
        94,
        131,
        125,
        184,
        183,
        24,
        125,
        229
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "registryAccount"
          ]
        },
        {
          "name": "registryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelProviderApproval",
      "discriminator": [
        73,
        244,
        41,
        170,
        219,
        230,
        204,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "registryAccount"
          ]
        },
        {
          "name": "registryAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "providerApproval",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112,
                  114,
                  111,
                  118,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "approvedBy",
          "writable": true,
          "relations": [
            "providerApproval"
          ]
        }
      ],
      "args": [
        {
          "name": "provider",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "claimProvider",
      "discriminator": [
        115,
        216,
        61,
        95,
        179,
        126,
        235,
        229
      ],
      "accounts": [
        {
          "name": "provider",
          "writable": true,
          "signer": true
        },
        {
          "name": "approvedBy",
          "writable": true,
          "relations": [
            "providerApproval"
          ]
        },
        {
          "name": "providerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "providerApproval",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  112,
                  112,
                  114,
                  111,
                  118,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initRegistry",
      "discriminator": [
        131,
        22,
        4,
        103,
        24,
        94,
        163,
        239
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "registryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "proposeAuthority",
      "discriminator": [
        20,
        148,
        236,
        198,
        76,
        119,
        99,
        142
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "registryAccount"
          ]
        },
        {
          "name": "registryAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "pendingAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "revokeProvider",
      "discriminator": [
        125,
        104,
        74,
        119,
        247,
        33,
        128,
        112
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "registryAccount"
          ]
        },
        {
          "name": "registryAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "providerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "provider"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "provider",
          "type": "pubkey"
        },
        {
          "name": "reason",
          "type": {
            "defined": {
              "name": "revocationReason"
            }
          }
        }
      ]
    },
    {
      "name": "selfRevokeProvider",
      "discriminator": [
        39,
        231,
        227,
        7,
        186,
        241,
        110,
        245
      ],
      "accounts": [
        {
          "name": "provider",
          "signer": true
        },
        {
          "name": "providerAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  118,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "provider"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": {
            "defined": {
              "name": "revocationReason"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "provenanceRecord",
      "discriminator": [
        122,
        140,
        17,
        228,
        106,
        92,
        71,
        82
      ]
    },
    {
      "name": "providerAccount",
      "discriminator": [
        0,
        183,
        216,
        154,
        30,
        170,
        67,
        66
      ]
    },
    {
      "name": "providerApproval",
      "discriminator": [
        150,
        142,
        26,
        94,
        184,
        78,
        228,
        73
      ]
    },
    {
      "name": "registryAccount",
      "discriminator": [
        113,
        93,
        106,
        201,
        100,
        166,
        146,
        98
      ]
    }
  ],
  "events": [
    {
      "name": "authorityTransferAccepted",
      "discriminator": [
        149,
        165,
        140,
        221,
        104,
        203,
        239,
        121
      ]
    },
    {
      "name": "authorityTransferCancelled",
      "discriminator": [
        31,
        228,
        187,
        148,
        20,
        99,
        237,
        48
      ]
    },
    {
      "name": "authorityTransferProposed",
      "discriminator": [
        103,
        244,
        27,
        116,
        177,
        4,
        100,
        119
      ]
    },
    {
      "name": "mediaAnchored",
      "discriminator": [
        252,
        204,
        2,
        132,
        47,
        93,
        201,
        170
      ]
    },
    {
      "name": "providerApprovalCancelled",
      "discriminator": [
        96,
        252,
        254,
        90,
        131,
        58,
        147,
        145
      ]
    },
    {
      "name": "providerApproved",
      "discriminator": [
        223,
        203,
        143,
        70,
        204,
        180,
        143,
        12
      ]
    },
    {
      "name": "providerRegistered",
      "discriminator": [
        38,
        209,
        137,
        78,
        185,
        19,
        147,
        14
      ]
    },
    {
      "name": "providerRevoked",
      "discriminator": [
        117,
        68,
        121,
        195,
        229,
        6,
        85,
        214
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAuthority",
      "msg": "Invalid Authority"
    },
    {
      "code": 6001,
      "name": "invalidProgramData",
      "msg": "Invalid Program Data"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6003,
      "name": "noPendingAuthority",
      "msg": "No Pending Authority"
    },
    {
      "code": 6004,
      "name": "invalidName",
      "msg": "Invalid Name"
    },
    {
      "code": 6005,
      "name": "invalidProvider",
      "msg": "Invalid Provider"
    },
    {
      "code": 6006,
      "name": "invalidCertIdentity",
      "msg": "Invalid Cert Identity"
    },
    {
      "code": 6007,
      "name": "invalidRefundAccount",
      "msg": "Invalid Refund Account"
    },
    {
      "code": 6008,
      "name": "providerRevoked",
      "msg": "Provider Revoked"
    },
    {
      "code": 6009,
      "name": "invalidRevocationReason",
      "msg": "Invalid Revocation Reason"
    },
    {
      "code": 6010,
      "name": "invalidHash",
      "msg": "Invalid Hash"
    },
    {
      "code": 6011,
      "name": "invalidCreator",
      "msg": "Invalid Creator"
    }
  ],
  "types": [
    {
      "name": "authorityTransferAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldAuthority",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "mediaAnchored",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "fileSha256",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "c2paManifestHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "perceptual",
            "type": {
              "option": {
                "defined": {
                  "name": "perceptualHash"
                }
              }
            }
          },
          {
            "name": "creatorWallet",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "generatedAt",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    },
    {
      "name": "perceptualAlg",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pHash"
          },
          {
            "name": "pdq"
          }
        ]
      }
    },
    {
      "name": "perceptualHash",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "alg",
            "type": {
              "defined": {
                "name": "perceptualAlg"
              }
            }
          },
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "provenanceRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "fileSha256",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "perceptual",
            "type": {
              "option": {
                "defined": {
                  "name": "perceptualHash"
                }
              }
            }
          },
          {
            "name": "c2paManifestHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "creatorWallet",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "generatedAt",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "providerAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "approvedBy",
            "type": "pubkey"
          },
          {
            "name": "c2paCertIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "activatedSlot",
            "type": "u64"
          },
          {
            "name": "revocation",
            "type": {
              "option": {
                "defined": {
                  "name": "revocation"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "providerApproval",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "c2paCertIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "approvedBy",
            "type": "pubkey"
          },
          {
            "name": "approvedSlot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "providerApprovalCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "approvedBy",
            "type": "pubkey"
          },
          {
            "name": "cancelledBy",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "providerApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "approvedBy",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "c2paCertIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "providerRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "c2paCertIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "providerRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "revokedBy",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "revocationReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "registryAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pendingAuthority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revocation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "revocationReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "revocationReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "keyCompromised"
          },
          {
            "name": "voluntary"
          },
          {
            "name": "policy"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "maxNameLen",
      "type": "u32",
      "value": "32"
    }
  ]
};
