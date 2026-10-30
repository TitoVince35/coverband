terraform {
  required_version = ">= 1.10"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.87"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
  }

  # State in a private Scaleway Object Storage bucket, created by hand once (see README.md).
  # The bucket name is given at init: tofu init -backend-config="bucket=<name>".
  backend "s3" {
    key          = "coverband.tfstate"
    region       = "fr-par"
    endpoints    = { s3 = "https://s3.fr-par.scw.cloud" }
    use_lockfile = true

    # Credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY set to a Scaleway API key (README.md).
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }

  # The state holds every secret (database credentials, API keys, the auth secret): it is
  # encrypted before it leaves this machine. Losing the passphrase means losing the state.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

provider "scaleway" {
  organization_id = var.organization_id
  project_id      = var.project_id
  region          = "fr-par"
  zone            = "fr-par-1"
}
