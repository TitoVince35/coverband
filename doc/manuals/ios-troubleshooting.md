# Coverband sur iPhone et iPad : dépannage

Coverband est une application web : elle ne s'installe pas depuis l'App Store, mais depuis le navigateur, en l'ajoutant à l'écran d'accueil. Une fois ajoutée, elle s'ouvre en plein écran avec sa propre icône, fonctionne sans connexion pendant le concert et peut recevoir des notifications.

Sur iPhone et iPad, le téléphone ne propose jamais l'installation de lui-même : il faut la faire à la main. Ce guide explique comment, et quoi faire quand ça ne marche pas.

## Ce qu'il faut

- **iOS 16.4 ou plus récent** (Réglages › Général › Informations › Version d'iOS). Avec une version plus ancienne, l'ajout à l'écran d'accueil fonctionne, mais sans notifications, et le fonctionnement hors connexion est moins fiable.
- **Safari** de préférence. Chrome et Edge savent aussi ajouter à l'écran d'accueil (voir plus bas).
- **Pas le navigateur intégré d'une autre application** (Gmail, Outlook, WhatsApp, Messenger, Instagram…) : la plupart ne proposent pas l'installation.

## Installer l'application, pas à pas

1. Ouvrez **Safari** et allez sur l'adresse de Coverband (celle de votre invitation, par exemple `https://beta.coverband.fr`).
2. Connectez-vous si besoin.
3. Touchez le bouton **Partager** (un carré avec une flèche vers le haut) :
   - **iOS 26 :** touchez le bouton **Plus** (« ••• », à côté de la barre d'adresse), puis **Partager**. Si vous avez placé les onglets en haut ou en bas (Réglages › Apps › Safari), le bouton Partager est directement visible.
   - **Versions plus anciennes :** le bouton Partager est dans la barre en bas de l'écran (en haut à droite sur iPad).
4. Dans la liste, faites défiler vers le bas et touchez **Sur l'écran d'accueil**.
   - Si l'option n'y est pas : tout en bas de la liste, touchez **Modifier les actions** et ajoutez-la.
5. **iOS 26 :** vérifiez que **Ouvrir comme app web** est activé.
6. Touchez **Ajouter**. L'icône Coverband apparaît sur l'écran d'accueil.
7. **Ouvrez Coverband depuis cette icône**, et non plus depuis Safari. Depuis iOS 17.2, la connexion de Safari est conservée ; avec une version plus ancienne, connectez-vous une nouvelle fois (une seule fois suffit).

## Les problèmes courants

### « Je ne trouve pas Sur l'écran d'accueil » ou « Il n'y a pas de bouton Partager »

C'est presque toujours parce que la page s'est ouverte **dans une autre application** que Safari. En touchant le lien de l'e-mail d'invitation dans Gmail, Outlook ou une messagerie, la page s'ouvre souvent dans le navigateur intégré de cette application, qui ne sait pas installer.

**Comment le reconnaître :** la barre en haut ou en bas de l'écran ne ressemble pas à celle de Safari, il y a souvent un bouton « OK », « Fermer » ou une croix, et vous êtes toujours dans l'application (Gmail, WhatsApp…).

**Solution :**

- Cherchez une option **Ouvrir dans Safari** ou **Ouvrir dans le navigateur** (souvent derrière « ••• » ou une icône de boussole), **ou**
- Copiez l'adresse, ouvrez Safari vous-même et collez-la dans la barre d'adresse.

Dans l'application Gmail, les réglages permettent aussi d'ouvrir les liens dans le navigateur par défaut du téléphone plutôt que dans Gmail.

Puis reprenez les étapes d'installation ci-dessus.

### Je suis dans Chrome, Firefox ou Edge

Depuis iOS 16.4, un navigateur autre que Safari peut ajouter un site à l'écran d'accueil, s'il le prévoit :

- **Chrome et Edge :** touchez l'icône **Partager** dans la barre d'adresse, puis **Sur l'écran d'accueil**.
- **Firefox et les autres :** l'option n'est pas toujours proposée.

Si l'option n'apparaît pas, mettez iOS et le navigateur à jour, ou passez par Safari : c'est le chemin le plus sûr.

### La carte « Installer Coverband » a disparu de l'accueil

Si vous avez touché la croix (« Ne plus afficher »), la carte ne revient plus sur cet appareil. Pas de souci : l'installation se fait toujours par les étapes ci-dessus, sans la carte.

### L'icône est sur l'écran d'accueil, mais l'application s'ouvre dans Safari

L'icône a été ajoutée comme simple signet : sur iOS 26, l'option **Ouvrir comme app web** était désactivée. Supprimez l'icône (appui long sur l'icône, puis supprimez-la), puis ajoutez-la de nouveau depuis Safari en activant **Ouvrir comme app web**.

### L'application installée me demande de me reconnecter

L'application installée garde sa propre connexion, séparée de Safari. Depuis iOS 17.2, elle reprend celle de Safari au moment de l'installation ; avant, ou sans connexion préalable dans Safari, il faut se connecter une fois de plus, avec la même adresse e-mail et le même mot de passe.

Si vous avez oublié votre mot de passe, demandez à votre band leader ou à l'équipe Coverband.

### Je ne reçois pas les notifications

1. Vérifiez que vous avez **iOS 16.4 ou plus récent**.
2. Les notifications ne fonctionnent que dans **l'application installée** : ouvrez Coverband **depuis l'icône de l'écran d'accueil**, pas depuis Safari.
3. Dans l'application, allez dans **Mon compte › Notifications** et touchez **Activer les notifications**, puis acceptez la demande du téléphone.
4. Si le message indique que les notifications sont bloquées : Réglages de l'iPhone › **Notifications**, choisissez Coverband dans la liste (sous le nom donné à l'icône), activez **Autoriser les notifications**, puis revenez dans l'application.
5. Vérifiez aussi que le mode **Concentration** (Ne pas déranger, Sommeil…) ne bloque pas Coverband.

### L'application ne fonctionne pas sans connexion

- L'application doit avoir été **ouverte au moins une fois avec une connexion** après l'installation : c'est à ce moment qu'elle enregistre ce qu'il faut sur le téléphone.
- Ouvrez à l'avance, avec une connexion, les morceaux et setlists dont vous aurez besoin.
- Sans l'installer, Safari peut effacer les données enregistrées d'un site après quelques jours sans l'ouvrir. **Installer l'application** évite ce problème.
- Hors connexion, les modifications sont désactivées : un bandeau l'indique en haut de l'écran.

### L'écran se met en veille pendant le concert

Les vues paroles et setlist en direct demandent au téléphone de garder l'écran allumé. Cela demande iOS 16.4 ou plus récent, et **iOS 18.4 ou plus récent dans l'application installée** (avant, iOS ignorait cette demande dans les apps de l'écran d'accueil). Avec une version plus ancienne, augmentez le délai de verrouillage : Réglages › Luminosité et affichage › **Verrouillage automatique** › Jamais, le temps du concert.

### Pas de vrai plein écran

Sur iPhone, une page web ne peut pas passer en plein écran. L'application installée, elle, s'ouvre déjà sans barre d'adresse : c'est une raison de plus de l'installer.

### Une page reste blanche ou affiche une ancienne version

1. Fermez complètement l'application (balayez vers le haut depuis le bas de l'écran, puis faites glisser Coverband vers le haut) et rouvrez-la.
2. Si le problème continue : supprimez l'icône de l'écran d'accueil, puis réinstallez l'application depuis Safari. Vous devrez vous reconnecter.

## Toujours bloqué ?

Écrivez à votre band leader ou à l'équipe Coverband en précisant :

- le modèle de votre iPhone ou iPad et la **version d'iOS** (Réglages › Général › Informations) ;
- le **navigateur** utilisé (Safari, Chrome…) et **l'application** depuis laquelle vous avez ouvert le lien (Gmail, WhatsApp…) ;
- ce que vous voyez à l'écran (une capture d'écran aide beaucoup).
