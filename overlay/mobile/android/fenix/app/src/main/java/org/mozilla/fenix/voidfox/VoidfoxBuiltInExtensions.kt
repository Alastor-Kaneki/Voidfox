/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.voidfox

import android.util.Log
import org.mozilla.fenix.FenixApplication

/** Installs WebExtensions that ship as part of Voidfox itself. */
object VoidfoxBuiltInExtensions {
    private const val TAG = "VoidfoxBuiltIns"
    private const val GX_ARCHIVE_EXTENSION_ID = "gx-archive-downloader@voidfox"
    private const val GX_ARCHIVE_EXTENSION_URI =
        "resource://android/assets/extensions/gx-archive-downloader/"

    fun install(application: FenixApplication) {
        application.components.core.geckoRuntime.webExtensionController
            .ensureBuiltIn(GX_ARCHIVE_EXTENSION_URI, GX_ARCHIVE_EXTENSION_ID)
            .accept(
                { extension ->
                    Log.i(TAG, "Built-in extension ready: ${extension?.id ?: GX_ARCHIVE_EXTENSION_ID}")
                },
                { error ->
                    Log.e(TAG, "Unable to install the GX archive downloader", error)
                },
            )
    }
}
